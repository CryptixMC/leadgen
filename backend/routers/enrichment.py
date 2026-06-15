import asyncio
import difflib
import logging
import os
import re
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import UUID

import httpx

logger = logging.getLogger(__name__)
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Request

from auth import require_auth
from db import supabase
from limiter import limiter
from models import Lead
from scoring import calculate_score
from utils import is_social_media_url, is_aggregator_url, SOCIAL_MEDIA_DOMAINS, AGGREGATOR_DOMAINS

router = APIRouter(prefix="/leads", tags=["enrichment"])

PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search"
DDG_SEARCH_URL = "https://html.duckduckgo.com/html/"

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_EMAIL_EXCLUDE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".pdf"}
_COPYRIGHT_RE = re.compile(r"(?:©|&copy;|Copyright\s*(?:©|&copy;)?\s*)(\d{4})", re.IGNORECASE)
_CURRENT_YEAR = datetime.now().year
_DIRECTORY_DOMAINS = {
    "yelp.com", "yellowpages.com", "tripadvisor.com",
    "google.com", "bbb.org", "foursquare.com", "mapquest.com",
    "whitepages.com", "angi.com", "houzz.com", "thumbtack.com",
} | SOCIAL_MEDIA_DOMAINS | AGGREGATOR_DOMAINS


async def _fetch_pagespeed(client: httpx.AsyncClient, url: str) -> dict:
    api_key = os.getenv("GOOGLE_PAGESPEED_API_KEY")
    # Must explicitly request each category — API only returns 'performance' by default
    _categories = ["performance", "seo", "best-practices", "accessibility"]
    base_params: list[tuple[str, str]] = [("url", url), ("strategy", "mobile")]
    for cat in _categories:
        base_params.append(("category", cat))
    if api_key:
        base_params.append(("key", api_key))

    desktop_params: list[tuple[str, str]] = [("url", url), ("strategy", "desktop"), ("category", "performance")]
    if api_key:
        desktop_params.append(("key", api_key))

    try:
        resp, resp_d = await asyncio.gather(
            client.get(PAGESPEED_URL, params=base_params, timeout=45),
            client.get(PAGESPEED_URL, params=desktop_params, timeout=45),
        )
        resp.raise_for_status()
        resp_d.raise_for_status()
        data = resp.json()
        lhr = data.get("lighthouseResult", {})
        categories = lhr.get("categories", {})

        def _score(cat: str) -> int | None:
            s = categories.get(cat, {}).get("score")
            return int(s * 100) if s is not None else None

        mobile_int = _score("performance")

        data_d = resp_d.json()
        categories_d = data_d.get("lighthouseResult", {}).get("categories", {})
        desktop_score = categories_d.get("performance", {}).get("score")
        desktop_int = int(desktop_score * 100) if desktop_score is not None else None

        audits = lhr.get("audits", {})
        viewport = audits.get("viewport", {})
        mobile_friendly = viewport.get("score") == 1

        screenshot = audits.get("final-screenshot", {}).get("details", {}).get("data")

        return {
            "pagespeed_mobile": mobile_int,
            "pagespeed_desktop": desktop_int,
            "mobile_friendly": mobile_friendly,
            "website_screenshot": screenshot,
            "pagespeed_seo": _score("seo"),
            "pagespeed_best_practices": _score("best-practices"),
        }
    except Exception as exc:
        logger.warning("PageSpeed failed for %s: %s", url, exc)
        return {
            "pagespeed_mobile": None,
            "pagespeed_desktop": None,
            "mobile_friendly": None,
            "website_screenshot": None,
            "pagespeed_seo": None,
            "pagespeed_best_practices": None,
        }


async def _fetch_yelp(client: httpx.AsyncClient, business_name: str, address: str, phone: str = "") -> dict:
    yelp_key = os.getenv("YELP_API_KEY")
    if not yelp_key:
        return {"also_on_yelp": None, "yelp_url": None}
    try:
        resp = await client.get(
            YELP_SEARCH_URL,
            params={"term": business_name, "location": address, "limit": 3},
            headers={"Authorization": f"Bearer {yelp_key}"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        businesses = data.get("businesses", [])
        if not businesses:
            return {"also_on_yelp": False, "yelp_url": None}

        our_city = address.split(",")[1].strip().lower() if "," in address else address.lower()
        our_digits = re.sub(r"\D", "", phone or "")

        for biz in businesses:
            yelp_name = biz.get("name", "").lower().strip()
            name_ratio = difflib.SequenceMatcher(None, business_name.lower(), yelp_name).ratio()
            if name_ratio < 0.5:
                continue

            yelp_city = biz.get("location", {}).get("city", "").lower().strip()
            if yelp_city and our_city and yelp_city not in our_city and our_city not in yelp_city:
                continue
            yelp_phone = re.sub(r"\D", "", biz.get("phone", "") or "")
            if our_digits and yelp_phone and our_digits != yelp_phone:
                continue
            return {"also_on_yelp": True, "yelp_url": biz.get("url")}

        return {"also_on_yelp": False, "yelp_url": None}
    except Exception:
        return {"also_on_yelp": None, "yelp_url": None}


async def _discover_website(client: httpx.AsyncClient, business_name: str, address: str) -> str | None:
    """Search DuckDuckGo for a business website not listed on Google Places."""
    city = address.split(",")[1].strip() if "," in address else address
    query = f'"{business_name}" "{city}"'
    try:
        resp = await client.post(
            DDG_SEARCH_URL,
            data={"q": query, "b": ""},
            headers={"User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0)"},
            timeout=15,
            follow_redirects=True,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for a in soup.select("a.result__url, a.result__a"):
            href = a.get("href", "")
            if not href or href.startswith("//duckduckgo"):
                continue
            if not href.startswith("http"):
                href = "https://" + href.lstrip("/")
            domain = urlparse(href).netloc.lower().lstrip("www.")
            if any(d in domain for d in _DIRECTORY_DOMAINS):
                continue
            if is_social_media_url(href):
                continue
            return href
    except Exception:
        pass
    return None


async def _scrape_website(client: httpx.AsyncClient, url: str) -> dict:
    """Fetch homepage and extract email address and site age estimate."""
    result: dict = {"email": None, "site_age_estimate": None}
    try:
        resp = await client.get(
            url, timeout=10, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0)"}
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # --- Email: mailto: links first, then regex scan ---
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("mailto:"):
                candidate = href[7:].split("?")[0].strip()
                if _EMAIL_RE.match(candidate):
                    result["email"] = candidate
                    break

        if not result["email"]:
            text = soup.get_text(" ")
            for match in _EMAIL_RE.finditer(text):
                candidate = match.group()
                if not any(candidate.lower().endswith(ext) for ext in _EMAIL_EXCLUDE_EXTS):
                    result["email"] = candidate
                    break

        # --- Site age: copyright year in HTML ---
        page_text = soup.get_text(" ")
        years = [
            int(m.group(1))
            for m in _COPYRIGHT_RE.finditer(page_text)
            if 1990 <= int(m.group(1)) <= _CURRENT_YEAR
        ]
        found_year: int | None = min(years) if years else None

        # Fallback: Last-Modified response header
        if found_year is None:
            last_modified = resp.headers.get("Last-Modified", "")
            if last_modified:
                year_match = re.search(r"\b(19|20)\d{2}\b", last_modified)
                if year_match:
                    y = int(year_match.group())
                    if 1990 <= y <= _CURRENT_YEAR:
                        found_year = y

        if found_year is not None:
            age = _CURRENT_YEAR - found_year
            result["site_age_estimate"] = f"~{found_year} (est. {age} yr{'s' if age != 1 else ''} old)"

    except Exception:
        pass
    return result


async def _resolve_final_url(client: httpx.AsyncClient, url: str) -> str:
    """Follow redirects via HEAD and return the final URL."""
    try:
        resp = await client.head(
            url, follow_redirects=True, timeout=10,
            headers={"User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0)"}
        )
        return str(resp.url)
    except Exception:
        return url


async def run_enrichment(client: httpx.AsyncClient, lead: dict) -> dict:
    """Run website discovery, scraping, pagespeed, and Yelp for a lead dict.

    Returns a dict of fields to upsert (does not write to DB).
    """
    enrichment: dict = {}

    website_url = lead.get("website_url")
    website_inferred = bool(lead.get("website_inferred"))

    # Clear social media URLs that slipped through scraping
    if is_social_media_url(website_url):
        website_url = None
        enrichment["website_url"] = None
        enrichment["has_website"] = False
        website_inferred = False

    # Detect aggregator/delivery platform redirects (e.g. SkipTheDishes, DoorDash)
    if website_url:
        final_url = await _resolve_final_url(client, website_url)
        if is_aggregator_url(final_url) or is_social_media_url(final_url):
            website_url = None
            enrichment["website_url"] = None
            enrichment["has_website"] = False
            website_inferred = False
            enrichment["website_inferred"] = False

    if not website_url:
        discovered = await _discover_website(client, lead.get("business_name", ""), lead.get("address", ""))
        if discovered:
            website_url = discovered
            website_inferred = True
            enrichment["website_url"] = website_url
        enrichment["website_inferred"] = website_inferred

    _biz = lead.get("business_name", "")
    _addr = lead.get("address", "")
    _phone = lead.get("phone", "") or ""

    if website_url:
        enrichment["has_https"] = website_url.startswith("https://")
        pagespeed, website_data, yelp = await asyncio.gather(
            _fetch_pagespeed(client, website_url),
            _scrape_website(client, website_url),
            _fetch_yelp(client, _biz, _addr, _phone),
        )
        enrichment.update(pagespeed)
        if website_data.get("email"):
            enrichment["email"] = website_data["email"]
        if website_data.get("site_age_estimate"):
            enrichment["site_age_estimate"] = website_data["site_age_estimate"]
    else:
        enrichment.update({
            "pagespeed_mobile": None,
            "pagespeed_desktop": None,
            "mobile_friendly": None,
            "website_screenshot": None,
            "pagespeed_seo": None,
            "pagespeed_best_practices": None,
        })
        yelp = await _fetch_yelp(client, _biz, _addr, _phone)

    enrichment.update(yelp)
    return enrichment


@router.post("/{lead_id}/enrich", response_model=Lead, dependencies=[Depends(require_auth)])
@limiter.limit("10/minute")
async def enrich_lead(request: Request, lead_id: UUID):
    result = supabase.table("leads").select("*").eq("id", str(lead_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = result.data[0]

    async with httpx.AsyncClient(limits=httpx.Limits(max_connections=50, max_keepalive_connections=20, keepalive_expiry=5.0)) as client:
        enrichment = await run_enrichment(client, lead)

    merged = {**lead, **enrichment}
    score, priority = calculate_score(merged)
    enrichment["lead_score"] = score
    enrichment["priority"] = priority
    enrichment["last_updated"] = datetime.now(timezone.utc).isoformat()

    updated = supabase.table("leads").update(enrichment).eq("id", str(lead_id)).execute()
    if not updated.data:
        raise HTTPException(status_code=500, detail="Failed to update lead after enrichment")
    return updated.data[0]

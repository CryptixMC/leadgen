import os
from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from auth import require_auth
from db import supabase
from limiter import limiter
from models import Lead

router = APIRouter(prefix="/leads", tags=["enrichment"])

PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search"


def _calculate_score(data: dict) -> tuple[int, str]:
    score = 0
    if not data.get("has_website"):
        score += 40
    if data.get("mobile_friendly") is False:
        score += 20
    pagespeed_mobile = data.get("pagespeed_mobile")
    if pagespeed_mobile is not None and pagespeed_mobile < 50:
        score += 15
    if not data.get("has_https"):
        score += 10
    if (data.get("review_count") or 0) < 10:
        score += 10
    if data.get("also_on_yelp") is False:
        score += 5

    score = min(score, 100)
    if score >= 60:
        priority = "high"
    elif score >= 30:
        priority = "medium"
    else:
        priority = "low"
    return score, priority


async def _fetch_pagespeed(client: httpx.AsyncClient, url: str) -> dict:
    api_key = os.getenv("GOOGLE_PAGESPEED_API_KEY")
    params = {"url": url, "strategy": "mobile", "key": api_key} if api_key else {"url": url, "strategy": "mobile"}
    try:
        resp = await client.get(PAGESPEED_URL, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        categories = data.get("lighthouseResult", {}).get("categories", {})
        mobile_score = categories.get("performance", {}).get("score")
        mobile_int = int(mobile_score * 100) if mobile_score is not None else None

        params_desktop = {**params, "strategy": "desktop"}
        resp_d = await client.get(PAGESPEED_URL, params=params_desktop, timeout=30)
        resp_d.raise_for_status()
        data_d = resp_d.json()
        categories_d = data_d.get("lighthouseResult", {}).get("categories", {})
        desktop_score = categories_d.get("performance", {}).get("score")
        desktop_int = int(desktop_score * 100) if desktop_score is not None else None

        audits = data.get("lighthouseResult", {}).get("audits", {})
        viewport = audits.get("viewport", {})
        mobile_friendly = viewport.get("score") == 1

        return {
            "pagespeed_mobile": mobile_int,
            "pagespeed_desktop": desktop_int,
            "mobile_friendly": mobile_friendly,
        }
    except Exception:
        return {"pagespeed_mobile": None, "pagespeed_desktop": None, "mobile_friendly": None}


async def _fetch_yelp(client: httpx.AsyncClient, business_name: str, address: str) -> dict:
    yelp_key = os.getenv("YELP_API_KEY")
    if not yelp_key:
        return {"also_on_yelp": None, "yelp_url": None}
    try:
        resp = await client.get(
            YELP_SEARCH_URL,
            params={"term": business_name, "location": address, "limit": 1},
            headers={"Authorization": f"Bearer {yelp_key}"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        businesses = data.get("businesses", [])
        if businesses:
            return {"also_on_yelp": True, "yelp_url": businesses[0].get("url")}
        return {"also_on_yelp": False, "yelp_url": None}
    except Exception:
        return {"also_on_yelp": None, "yelp_url": None}


@router.post("/{lead_id}/enrich", response_model=Lead, dependencies=[Depends(require_auth)])
@limiter.limit("10/minute")
async def enrich_lead(request: Request, lead_id: UUID):
    result = supabase.table("leads").select("*").eq("id", str(lead_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = result.data[0]

    enrichment: dict = {}

    async with httpx.AsyncClient() as client:
        website_url = lead.get("website_url")
        if website_url:
            enrichment["has_https"] = website_url.startswith("https://")
            pagespeed = await _fetch_pagespeed(client, website_url)
            enrichment.update(pagespeed)
        else:
            enrichment.update({"pagespeed_mobile": None, "pagespeed_desktop": None, "mobile_friendly": None})

        yelp = await _fetch_yelp(client, lead.get("business_name", ""), lead.get("address", ""))
        enrichment.update(yelp)

    merged = {**lead, **enrichment}
    score, priority = _calculate_score(merged)
    enrichment["lead_score"] = score
    enrichment["priority"] = priority
    enrichment["last_updated"] = datetime.now(timezone.utc).isoformat()

    updated = supabase.table("leads").update(enrichment).eq("id", str(lead_id)).execute()
    if not updated.data:
        raise HTTPException(status_code=500, detail="Failed to update lead after enrichment")
    return updated.data[0]

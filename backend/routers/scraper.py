import asyncio
import os
import random
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from auth import require_auth
from db import supabase
from limiter import limiter
from models import ScrapeRequest, ScrapeResponse

router = APIRouter(prefix="/scrapes", tags=["scraper"])

PLACES_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAIL_URL = "https://maps.googleapis.com/maps/api/place/details/json"
DETAIL_FIELDS = "name,formatted_address,formatted_phone_number,website,rating,user_ratings_total"


async def _get_with_backoff(client: httpx.AsyncClient, url: str, params: dict, max_retries: int = 5) -> dict:
    for attempt in range(max_retries):
        response = await client.get(url, params=params)
        if response.status_code == 429:
            wait = (2 ** attempt) + random.uniform(0, 1)
            await asyncio.sleep(wait)
            continue
        response.raise_for_status()
        return response.json()
    raise HTTPException(status_code=429, detail="Google Places API rate limit exceeded after retries")


@router.post("", response_model=ScrapeResponse, dependencies=[Depends(require_auth)])
@limiter.limit("10/minute")
async def scrape(request: Request, payload: ScrapeRequest):
    api_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_PLACES_API_KEY not configured")

    query = f"{payload.category} in {payload.city}"

    async with httpx.AsyncClient(timeout=30) as client:
        search_data = await _get_with_backoff(client, PLACES_SEARCH_URL, {
            "query": query,
            "key": api_key,
        })

        status = search_data.get("status")
        if status not in ("OK", "ZERO_RESULTS"):
            raise HTTPException(status_code=502, detail=f"Places API error: {status}")

        places = search_data.get("results", [])
        upserted = 0

        for place in places:
            place_id = place.get("place_id")
            if not place_id:
                continue

            detail_data = await _get_with_backoff(client, PLACES_DETAIL_URL, {
                "place_id": place_id,
                "fields": DETAIL_FIELDS,
                "key": api_key,
            })
            detail = detail_data.get("result", {})

            website = detail.get("website") or place.get("website")
            has_website = bool(website)
            has_https = website.startswith("https://") if website else False

            location = place.get("geometry", {}).get("location", {})

            now = datetime.now(timezone.utc).isoformat()
            lead = {
                "business_name": detail.get("name") or place.get("name", ""),
                "address": detail.get("formatted_address") or place.get("formatted_address", ""),
                "phone": detail.get("formatted_phone_number", ""),
                "website_url": website,
                "google_place_id": place_id,
                "google_rating": detail.get("rating") or place.get("rating", 0.0),
                "review_count": detail.get("user_ratings_total") or place.get("user_ratings_total", 0),
                "has_gbp": True,
                "has_website": has_website,
                "has_https": has_https,
                "latitude": location.get("lat"),
                "longitude": location.get("lng"),
                "status": "cold",
                "last_updated": now,
            }

            existing = supabase.table("leads").select("id").eq("google_place_id", place_id).execute()
            if existing.data:
                supabase.table("leads").update({**lead}).eq("google_place_id", place_id).execute()
            else:
                lead["created_at"] = now
                supabase.table("leads").insert(lead).execute()

            upserted += 1

    return ScrapeResponse(upserted=upserted, category=payload.category, city=payload.city)

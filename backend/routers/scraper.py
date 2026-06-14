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
from utils import is_social_media_url

router = APIRouter(prefix="/scrapes", tags=["scraper"])

PLACES_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
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


async def _fetch_nearby_page(
    client: httpx.AsyncClient,
    api_key: str,
    category: str,
    lat: float,
    lng: float,
    next_page_token: str | None,
) -> dict:
    if next_page_token:
        for _ in range(8):
            await asyncio.sleep(3)
            data = await _get_with_backoff(client, PLACES_NEARBY_URL, {
                "pagetoken": next_page_token,
                "key": api_key,
            })
            if data.get("status") != "INVALID_REQUEST":
                return data
        raise HTTPException(status_code=502, detail="Places API page token never became valid")

    return await _get_with_backoff(client, PLACES_NEARBY_URL, {
        "location": f"{lat},{lng}",
        "radius": 50000,
        "keyword": category,
        "key": api_key,
    })


async def _upsert_place(client: httpx.AsyncClient, place: dict, api_key: str) -> bool:
    place_id = place.get("place_id")
    if not place_id:
        return False

    detail_data = await _get_with_backoff(client, PLACES_DETAIL_URL, {
        "place_id": place_id,
        "fields": DETAIL_FIELDS,
        "key": api_key,
    })
    detail = detail_data.get("result", {})

    website = detail.get("website") or place.get("website")
    if is_social_media_url(website):
        website = None
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

    return True


@router.post("", response_model=ScrapeResponse, dependencies=[Depends(require_auth)])
@limiter.limit("10/minute")
async def scrape(request: Request, payload: ScrapeRequest):
    api_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_PLACES_API_KEY not configured")

    target = max(1, payload.target)
    upserted = 0
    pages_fetched = 0
    city_lat: float | None = None
    city_lng: float | None = None

    async with httpx.AsyncClient(timeout=120) as client:
        # Page 1: Text Search to get results + extract city lat/lng from geometry
        search_data = await _get_with_backoff(client, PLACES_SEARCH_URL, {
            "query": f"{payload.category} in {payload.city}",
            "key": api_key,
        })

        status = search_data.get("status")
        if status not in ("OK", "ZERO_RESULTS"):
            raise HTTPException(status_code=502, detail=f"Places API error: {status}")

        pages_fetched += 1
        places = search_data.get("results", [])

        for place in places:
            if upserted >= target:
                break
            # Grab city center from the first result
            if city_lat is None:
                loc = place.get("geometry", {}).get("location", {})
                city_lat = loc.get("lat")
                city_lng = loc.get("lng")
            ok = await _upsert_place(client, place, api_key)
            if ok:
                upserted += 1

        # Pages 2+: Nearby Search (its next_page_token works correctly)
        if upserted < target and city_lat is not None:
            next_page_token = None
            first_nearby = True

            while upserted < target:
                if first_nearby:
                    search_data = await _fetch_nearby_page(
                        client, api_key, payload.category, city_lat, city_lng, None
                    )
                    first_nearby = False
                else:
                    if not next_page_token:
                        break
                    search_data = await _fetch_nearby_page(
                        client, api_key, payload.category, city_lat, city_lng, next_page_token
                    )

                status = search_data.get("status")
                if status not in ("OK", "ZERO_RESULTS"):
                    raise HTTPException(status_code=502, detail=f"Places API error: {status}")

                pages_fetched += 1
                places = search_data.get("results", [])

                for place in places:
                    if upserted >= target:
                        break
                    ok = await _upsert_place(client, place, api_key)
                    if ok:
                        upserted += 1

                next_page_token = search_data.get("next_page_token")
                if not next_page_token:
                    break

    return ScrapeResponse(
        upserted=upserted,
        category=payload.category,
        city=payload.city,
        pages_fetched=pages_fetched,
    )

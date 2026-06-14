import io
import os
import httpx
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from auth import require_auth
from db import supabase
from limiter import limiter
from models import Lead, LeadUpdate, GeocodeResponse

router = APIRouter(prefix="/leads", tags=["leads"])

TSV_COLUMNS = [
    "id", "business_name", "address", "phone", "website_url",
    "google_place_id", "google_rating", "review_count", "has_gbp",
    "has_website", "has_https", "pagespeed_mobile", "pagespeed_desktop",
    "mobile_friendly", "site_age_estimate", "also_on_yelp", "yelp_url",
    "lead_score", "priority", "status", "notes", "created_at", "last_updated",
]


@router.get("/export", dependencies=[Depends(require_auth)])
async def export_leads():
    result = supabase.table("leads").select("*").order("lead_score", desc=True).execute()
    rows = result.data or []

    buf = io.StringIO()
    buf.write("\t".join(TSV_COLUMNS) + "\n")
    for row in rows:
        buf.write("\t".join(str(row.get(col, "") or "") for col in TSV_COLUMNS) + "\n")

    buf.seek(0)
    return StreamingResponse(
        iter([buf.read()]),
        media_type="text/tab-separated-values",
        headers={"Content-Disposition": "attachment; filename=leads.tsv"},
    )


PLACES_DETAIL_URL = "https://maps.googleapis.com/maps/api/place/details/json"


@router.post("/geocode-missing", response_model=GeocodeResponse, dependencies=[Depends(require_auth)])
@limiter.limit("5/minute")
async def geocode_missing(request: Request):
    api_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_PLACES_API_KEY not configured")

    rows = (
        supabase.table("leads")
        .select("id, google_place_id")
        .is_("latitude", "null")
        .execute()
    ).data or []

    geocoded = failed = skipped = 0
    async with httpx.AsyncClient(timeout=15) as client:
        for row in rows:
            place_id = row.get("google_place_id")
            if not place_id:
                skipped += 1
                continue
            try:
                res = await client.get(PLACES_DETAIL_URL, params={
                    "place_id": place_id,
                    "fields": "geometry",
                    "key": api_key,
                })
                data = res.json()
                loc = data.get("result", {}).get("geometry", {}).get("location", {})
                lat, lng = loc.get("lat"), loc.get("lng")
                if lat is not None and lng is not None:
                    supabase.table("leads").update({"latitude": lat, "longitude": lng}).eq("id", row["id"]).execute()
                    geocoded += 1
                else:
                    failed += 1
            except Exception:
                failed += 1

    return GeocodeResponse(geocoded=geocoded, failed=failed, skipped=skipped)


@router.get("", response_model=list[Lead], dependencies=[Depends(require_auth)])
async def list_leads(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
):
    query = supabase.table("leads").select("*").order("lead_score", desc=True)
    if status:
        query = query.eq("status", status)
    if priority:
        query = query.eq("priority", priority)
    result = query.execute()
    return result.data or []


@router.get("/{lead_id}", response_model=Lead, dependencies=[Depends(require_auth)])
async def get_lead(lead_id: UUID):
    result = supabase.table("leads").select("*").eq("id", str(lead_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    return result.data[0]


@router.patch("/{lead_id}", response_model=Lead, dependencies=[Depends(require_auth)])
async def update_lead(lead_id: UUID, payload: LeadUpdate):
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No updatable fields provided")

    from datetime import datetime, timezone
    update_data["last_updated"] = datetime.now(timezone.utc).isoformat()

    result = (
        supabase.table("leads")
        .update(update_data)
        .eq("id", str(lead_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    return result.data[0]

import io
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from auth import require_auth
from db import supabase
from models import Lead, LeadUpdate

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

from __future__ import annotations
from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class Lead(BaseModel):
    id: Optional[UUID] = None
    business_name: str
    address: str
    phone: str
    website_url: Optional[str] = None
    google_place_id: str
    google_rating: float
    review_count: int
    has_gbp: bool
    has_website: bool
    has_https: bool
    pagespeed_mobile: Optional[int] = None
    pagespeed_desktop: Optional[int] = None
    mobile_friendly: Optional[bool] = None
    site_age_estimate: Optional[str] = None
    also_on_yelp: Optional[bool] = None
    yelp_url: Optional[str] = None
    email: Optional[str] = None
    website_inferred: Optional[bool] = None
    website_screenshot: Optional[str] = None
    pagespeed_seo: Optional[int] = None
    pagespeed_best_practices: Optional[int] = None
    lead_score: Optional[int] = None
    priority: Optional[str] = None
    status: str = "cold"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    last_updated: Optional[datetime] = None


class LeadUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None


class ScrapeRequest(BaseModel):
    category: str
    city: str
    target: int = 60


class ScrapeResponse(BaseModel):
    upserted: int
    category: str
    city: str
    pages_fetched: int


class GeocodeResponse(BaseModel):
    geocoded: int
    failed: int
    skipped: int


class RescoreResponse(BaseModel):
    updated: int
    total: int


class BatchDeleteRequest(BaseModel):
    ids: list[UUID]


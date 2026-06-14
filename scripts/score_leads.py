#!/usr/bin/env python3
"""Recalculates lead_score and priority for all leads and patches them in Supabase."""
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

_here = Path(__file__).parent
load_dotenv(_here / ".env")
load_dotenv(_here.parent / "backend" / ".env")


def calc_score(lead: dict) -> int:
    score = 0
    if not lead.get("has_website"):
        score += 40
    if lead.get("mobile_friendly") is False:
        score += 20
    pagespeed = lead.get("pagespeed_mobile")
    if pagespeed is not None and pagespeed < 50:
        score += 15
    if not lead.get("has_https"):
        score += 10
    if (lead.get("review_count") or 0) < 10:
        score += 10
    if not lead.get("also_on_yelp") and lead.get("has_gbp"):
        score += 5
    return min(score, 100)


def calc_priority(score: int) -> str:
    if score >= 60:
        return "high"
    if score >= 30:
        return "medium"
    return "low"


def main():
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env", file=sys.stderr)
        sys.exit(1)

    sb = create_client(supabase_url, supabase_key)

    result = sb.table("leads").select("*").execute()
    leads = result.data or []
    print(f"Loaded {len(leads)} leads")

    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for lead in leads:
        score = calc_score(lead)
        priority = calc_priority(score)
        if lead.get("lead_score") == score and lead.get("priority") == priority:
            continue
        sb.table("leads").update(
            {"lead_score": score, "priority": priority, "last_updated": now}
        ).eq("id", lead["id"]).execute()
        updated += 1
        name = (lead.get("business_name") or "")[:40]
        print(f"  {name:<40}  score={score:3d}  priority={priority}")

    print(f"Done. Updated {updated}/{len(leads)} leads.")


if __name__ == "__main__":
    main()

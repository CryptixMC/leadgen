#!/usr/bin/env python3
"""Batch scraper — calls POST /scrapes on the backend and reports new vs existing leads."""
import argparse
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client

_here = Path(__file__).parent
load_dotenv(_here / ".env")
load_dotenv(_here.parent / "backend" / ".env")


def _lead_count(sb) -> int:
    result = sb.table("leads").select("id", count="exact").execute()
    return result.count or 0


def main():
    parser = argparse.ArgumentParser(description="Batch scrape leads via the backend API")
    parser.add_argument("--category", required=True, help="Business category (e.g. restaurant)")
    parser.add_argument("--city", required=True, help="City (e.g. 'Winnipeg MB')")
    parser.add_argument("--limit", type=int, default=20, help="Max leads to process per call (advisory)")
    parser.add_argument(
        "--api-url",
        default=os.getenv("API_URL", "http://localhost:8000"),
        help="Backend API base URL",
    )
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    script_token = os.getenv("SCRIPT_API_TOKEN")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env", file=sys.stderr)
        sys.exit(1)
    if not script_token:
        print("ERROR: SCRIPT_API_TOKEN must be set in .env", file=sys.stderr)
        sys.exit(1)

    sb = create_client(supabase_url, supabase_key)

    before = _lead_count(sb)
    print(f"Scraping: category={args.category!r}  city={args.city!r}  limit={args.limit}")

    try:
        resp = httpx.post(
            f"{args.api_url}/scrapes",
            json={"category": args.category, "city": args.city},
            headers={"Authorization": f"Bearer {script_token}"},
            timeout=120,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    data = resp.json()
    upserted = data["upserted"]

    after = _lead_count(sb)
    added = after - before
    existed = upserted - added

    print(f"Done.  upserted={upserted}  added={added}  already_existed={existed}")


if __name__ == "__main__":
    main()

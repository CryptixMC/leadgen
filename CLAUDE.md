# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Internal lead generation and CRM tool for Liam Nicholson Business Tech Consulting.
Pulls small business leads from Google Places API + Yelp, scores them automatically,
and presents them in a review UI. Goal: ranked, actionable cold outreach leads with
zero manual data entry.

---

## Commands

```bash
# Backend (FastAPI) — uses a .venv at backend/.venv
cd backend
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (SvelteKit)
cd frontend
npm install
npm run dev
```

---

## Repo Structure

```
lead-generator/
├── frontend/               # SvelteKit — Vercel
│   └── src/
│       ├── lib/
│       │   ├── api.ts          # all backend API calls + Lead type
│       │   └── supabase.js     # Supabase browser client (SSR-safe)
│       └── routes/
│           ├── +layout.server.js   # auth guard — redirects to /login if no cookie
│           ├── +layout.svelte      # nav + global styles
│           ├── +page.svelte        # lead dashboard (table + filters + batch delete + create modal)
│           ├── leads/[id]/         # individual lead detail, status/notes editing, enrich button
│           ├── map/                # Leaflet map of geocoded leads, geocode-missing trigger
│           ├── scraper/            # trigger scrapes from UI
│           └── login/              # Supabase email/password sign-in
└── backend/                # FastAPI — Vercel
    ├── main.py             # app init, CORS (FRONTEND_URL env + localhost wildcard), rate limiter wiring
    ├── auth.py             # require_auth dependency — validates Supabase JWT
    ├── limiter.py          # slowapi Limiter singleton (rate limits per endpoint)
    ├── utils.py            # is_social_media_url / is_aggregator_url helpers
    ├── scoring.py          # unified lead scoring function — single source of truth
    ├── models.py           # Pydantic schemas (Lead, LeadCreate, LeadUpdate, ScrapeRequest, etc.)
    ├── db.py               # Supabase client singleton
    ├── vercel.json         # Vercel serverless config
    └── routers/
        ├── leads.py        # CRUD + export + geocode-missing + rescore
        ├── scraper.py      # Places API text/nearby search with page-token pagination
        └── enrichment.py   # PageSpeed + Yelp + DuckDuckGo discovery + homepage scraping
```

---

## Stack

| Layer | Tool | Notes |
|---|---|---|
| Database | Supabase (Postgres) | Free tier, hosted |
| Backend | FastAPI (Python) | Hosted on Vercel |
| Frontend | SvelteKit (Svelte 5) | Hosted on Vercel |
| Scraping | Google Places API | Free up to ~$200/mo credit |
| Enrichment | Google PageSpeed Insights API | Free |
| Cross-ref | Yelp Fusion API | Free tier |

---

## Authentication

All backend routes require a `Bearer` token via `Authorization` header (enforced by `auth.py`'s `require_auth` dependency).

Valid token type:
- **Supabase JWT** — validated via `supabase.auth.get_user()`. Frontend stores it as the `sb_access_token` cookie after sign-in.

Frontend auth flow: `+layout.server.js` reads the `sb_access_token` cookie on every SSR load and redirects to `/login` if absent. Client-side calls use `getClientToken()` from `src/lib/api.ts` to read the cookie for direct fetch calls.

The Supabase browser client in `src/lib/supabase.js` is guarded by a `browser` check — it returns `null` during SSR. Never call it outside browser event handlers.

---

## Database Schema

Table: `leads`

```sql
id                  uuid primary key
business_name       text
address             text
phone               text
website_url         text nullable
google_place_id     text unique
google_rating       float
review_count        int
has_gbp             boolean        -- has Google Business Profile
has_website         boolean
has_https           boolean
pagespeed_mobile    int            -- 0–100
pagespeed_desktop   int            -- 0–100
pagespeed_seo       int            -- 0–100
pagespeed_best_practices int       -- 0–100
mobile_friendly     boolean
website_inferred    boolean        -- true if URL was discovered via DuckDuckGo, not from GBP
website_screenshot  text nullable  -- base64 data URI from PageSpeed final-screenshot audit
email               text nullable  -- extracted from homepage mailto: links or regex scan
site_age_estimate   text           -- rough guess from copyright year in HTML or Last-Modified header
also_on_yelp        boolean
yelp_url            text nullable
latitude            float nullable
longitude           float nullable
lead_score          int            -- 0–100, higher = better prospect
priority            text           -- 'high' | 'medium' | 'low'
status              text           -- 'cold' | 'contacted' | 'proposal' | 'closed_won' | 'closed_lost'
notes               text nullable
created_at          timestamptz
last_updated        timestamptz
```

---

## Lead Scoring Logic

Score is 0–100, capped. Higher = more likely to convert. Single source of truth: `backend/scoring.py`.

| Signal | Points |
|---|---|
| No website at all | +40 |
| Website inferred (discovered, not from GBP) | +20 |
| Website fails mobile (`mobile_friendly == False`) | +20 |
| PageSpeed mobile 0–24 | +20 |
| PageSpeed mobile 25–49 | +15 |
| PageSpeed mobile 50–74 | +5 |
| PageSpeed SEO < 50 | +10 |
| PageSpeed SEO 50–79 | +5 |
| PageSpeed best practices < 50 | +10 |
| PageSpeed best practices 50–79 | +5 |
| No HTTPS | +10 |
| Review count under 10 | +10 |
| Not on Yelp (only when `has_gbp` is True) | +5 |

Priority assignment:
- Score 60+ → `high`
- Score 30–59 → `medium`
- Score under 30 → `low`

---

## Enrichment Pipeline

`run_enrichment()` in `routers/enrichment.py` is the core enrichment flow (called by `POST /leads/{id}/enrich` and `POST /leads/rescore`):

1. **URL cleanup** — strips social media URLs (Facebook, Instagram, etc.) and follows redirects to detect aggregator landing pages (SkipTheDishes, DoorDash, etc.); both lists live in `utils.py`.
2. **Website discovery** — if no valid website URL, searches DuckDuckGo for `"business name" "city"` and returns the first non-directory, non-social result. Sets `website_inferred = True`.
3. **PageSpeed** — mobile + desktop performance, SEO, best-practices scores; extracts `final-screenshot` base64 for the detail view. Requires explicit `category` params — API only returns `performance` by default.
4. **Homepage scrape** — fetches homepage, extracts email from `mailto:` links (then regex fallback), estimates site age from copyright year or `Last-Modified` header.
5. **Yelp** — matches by city substring + phone digit comparison to avoid false positives.

Score recalculates after every enrichment run.

---

## API Endpoints

All routes require `Authorization: Bearer <token>`.

| Method | Path | Notes |
|---|---|---|
| GET | `/leads` | List, filterable by `?status=` and `?priority=`, ordered by score desc |
| POST | `/leads` | Create manual lead (synthetic `google_place_id`, `has_gbp: false`) |
| GET | `/leads/export` | TSV download, score-sorted |
| POST | `/leads/geocode-missing` | Fills lat/lng for leads with null coordinates via Places Details API. Rate limited 5/min |
| POST | `/leads/rescore` | Re-enriches + rescores all leads. Rate limited 2/min |
| GET | `/leads/{id}` | Single lead |
| PATCH | `/leads/{id}` | Update `status` and/or `notes` only |
| DELETE | `/leads/{id}` | Delete single lead |
| DELETE | `/leads` | Batch delete — body: `{ "ids": [...] }` |
| POST | `/leads/{id}/enrich` | Run enrichment pipeline for one lead. Rate limited 10/min |
| POST | `/scrapes` | Trigger Places API scrape. Rate limited 10/min |
| GET | `/health` | Health check (no auth) |

---

## Environment Variables

```
# backend/.env
SUPABASE_URL=
SUPABASE_KEY=
GOOGLE_PLACES_API_KEY=
GOOGLE_PAGESPEED_API_KEY=
YELP_API_KEY=
FRONTEND_URL=                 # production frontend origin for CORS allow-list

# frontend/.env (also .env.example present in frontend/)
PUBLIC_API_URL=http://localhost:8000
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
```

Never commit `.env`. `.env.example` with blank values lives in both `backend/` and `frontend/`.

---

## Conventions

- Frontend uses **Svelte 5 runes** (`$state`, `$derived`, `$props`) — not Svelte 4 stores.
- Backend routes are plural nouns: `/leads`, `/scrapes`.
- Supabase client is initialized once in `db.py` and imported everywhere — never re-instantiated.
- All scraper and enrichment functions are async.
- Pydantic models in `models.py` — one model per entity, separate Request/Response variants where needed.
- Frontend fetches from backend API only via `src/lib/api.ts` — never hits Supabase directly for data.
- TSV export at `GET /leads/export` for Google Sheets compatibility.

---

## Key Rules

- Never hardcode API keys — always `os.getenv()`.
- Scraper must handle rate limits gracefully — exponential backoff on 429s (`_get_with_backoff` in `scraper.py`).
- PageSpeed and Yelp calls are enrichment, not blocking — if they fail, lead still saves with nulls.
- `google_place_id` is the unique key — never create duplicate leads for the same place. Manual leads get a `manual_<uuid>` synthetic ID.
- Lead score recalculates on every enrichment update, not just on creation.
- Status and notes are the only fields updated from the frontend — scraper/enrichment owns everything else.
- Social media and aggregator URLs must be filtered before saving `website_url`; use `utils.py` helpers, not inline string checks.

# Lead Gen — CLAUDE.md

## Project Overview
Internal lead generation and CRM tool for Liam Nicholson Business Tech Consulting.
Pulls small business leads from Google Places API + Yelp, scores them automatically,
and presents them in a review UI. Goal: ranked, actionable cold outreach leads with
zero manual data entry.

---

## Commands

```bash
# Backend (FastAPI)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (SvelteKit)
cd frontend
npm install
npm run dev

# Run a batch scrape manually
cd scripts
python scrape_batch.py --category "restaurant" --city "Winnipeg MB" --limit 100

# Re-score all existing leads
python score_leads.py
```

---

## Repo Structure

```
client-liam-leadgen/
├── frontend/               # SvelteKit — Vercel
│   └── src/routes/
│       ├── +page.svelte        # lead dashboard
│       ├── leads/[id]/         # individual lead detail + notes
│       └── scraper/            # trigger scrapes from UI
├── backend/                # FastAPI — Render
│   ├── main.py
│   ├── routers/
│   │   ├── leads.py            # CRUD
│   │   ├── scraper.py          # Places API + Yelp
│   │   └── enrichment.py       # PageSpeed, cross-ref scoring
│   ├── models.py               # Pydantic schemas
│   ├── db.py                   # Supabase client
│   └── requirements.txt
└── scripts/                # Standalone Python — run locally
    ├── scrape_batch.py
    └── score_leads.py
```

---

## Stack

| Layer | Tool | Notes |
|---|---|---|
| Database | Supabase (Postgres) | Free tier, hosted |
| Backend | FastAPI (Python) | Hosted on Render free tier |
| Frontend | SvelteKit | Hosted on Vercel |
| Scraping | Google Places API | Free up to ~$200/mo credit |
| Enrichment | Google PageSpeed Insights API | Free |
| Cross-ref | Yelp Fusion API | Free tier |

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
mobile_friendly     boolean
site_age_estimate   text           -- rough guess from headers/footer
also_on_yelp        boolean
yelp_url            text nullable
lead_score          int            -- 0–100, higher = better prospect
priority            text           -- 'high' | 'medium' | 'low'
status              text           -- 'cold' | 'contacted' | 'proposal' | 'closed_won' | 'closed_lost'
notes               text nullable
created_at          timestamptz
last_updated        timestamptz
```

---

## Lead Scoring Logic

Score is 0–100. Higher = more likely to convert.

| Signal | Points |
|---|---|
| No website at all | +40 |
| Website fails mobile | +20 |
| PageSpeed mobile under 50 | +15 |
| No HTTPS | +10 |
| Review count under 10 | +10 |
| Not on Yelp but business exists | +5 |

Priority assignment:
- Score 60+ → `high`
- Score 30–59 → `medium`
- Score under 30 → `low`

---

## Environment Variables

```
# backend/.env
SUPABASE_URL=
SUPABASE_KEY=
GOOGLE_PLACES_API_KEY=
GOOGLE_PAGESPEED_API_KEY=
YELP_API_KEY=
```

Never commit `.env`. `.env.example` with blank values lives in the repo.

---

## Conventions

- Backend routes are plural nouns: `/leads`, `/scrapes`
- Supabase client is initialized once in `db.py` and imported everywhere — never re-instantiated
- All scraper functions are async
- Pydantic models in `models.py` — one model per entity, separate Request/Response variants where needed
- Frontend fetches from backend API only — never hits Supabase directly from SvelteKit
- TSV export endpoint lives at `GET /leads/export` for compatibility with Google Sheets if needed

---

## Key Rules

- Never hardcode API keys — always `os.getenv()`
- Scraper must handle rate limits gracefully — exponential backoff on 429s
- PageSpeed and Yelp calls are enrichment, not blocking — if they fail, lead still saves with nulls
- `google_place_id` is the unique key — never create duplicate leads for the same place
- Lead score recalculates on every enrichment update, not just on creation
- Status changes are the only thing updated from the frontend — scraper owns everything else

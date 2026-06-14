# Lead Generator

Internal lead generation and CRM tool for small business cold outreach. Pulls leads from Google Places and Yelp, scores them automatically based on digital presence gaps, and presents them in a review dashboard — ranked, actionable, and zero manual data entry.

Built for Liam Nicholson Business Tech Consulting.

---

## What it does

1. **Scrapes** small businesses by category and city via Google Places API
2. **Enriches** each lead — PageSpeed scores, HTTPS check, Yelp cross-reference
3. **Scores** leads 0–100 based on digital weakness signals (no website, slow mobile, no HTTPS, etc.)
4. **Presents** them in a SvelteKit dashboard with filtering, notes, status tracking, and a map view

---

## Stack

| Layer | Tool | Hosting |
|---|---|---|
| Database | Supabase (Postgres) | Supabase cloud |
| Backend | FastAPI (Python) | Render (free tier) |
| Frontend | SvelteKit | Vercel |
| Scraping | Google Places API | — |
| Enrichment | Google PageSpeed Insights + Yelp Fusion | — |

---

## Repo structure

```
lead-generator/
├── frontend/               # SvelteKit app
│   └── src/routes/
│       ├── +page.svelte            # lead dashboard
│       ├── leads/[id]/             # individual lead detail + notes
│       ├── scraper/                # trigger scrapes from UI
│       ├── map/                    # map view of leads
│       └── login/                  # auth
├── backend/                # FastAPI app
│   ├── main.py
│   ├── auth.py                     # token-based auth
│   ├── limiter.py                  # rate limiting (slowapi)
│   ├── db.py                       # Supabase client (singleton)
│   ├── models.py                   # Pydantic schemas
│   ├── utils.py
│   └── routers/
│       ├── leads.py                # CRUD + export
│       ├── scraper.py              # Google Places scraper
│       └── enrichment.py          # PageSpeed, Yelp, re-scoring
└── scripts/                # Standalone scripts — run locally
    ├── scrape_batch.py             # batch scrape by category/city
    └── score_leads.py              # re-score all existing leads
```

---

## Local setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Supabase project
- Google Places API key
- Google PageSpeed Insights API key
- Yelp Fusion API key

### Backend

```bash
cd backend
cp ../.env.example .env   # fill in your keys
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env      # fill in PUBLIC_ vars
npm install
npm run dev
```

### Scripts (optional, run ad-hoc)

```bash
cd scripts
cp ../.env.example .env   # same keys as backend
pip install -r requirements.txt

# Scrape a category in a city
python scrape_batch.py --category "restaurant" --city "Winnipeg MB" --limit 100

# Re-score all leads already in the database
python score_leads.py
```

---

## Environment variables

Copy `.env.example` and fill in values. Never commit `.env`.

```env
# Backend (server-side only)
SUPABASE_URL=
SUPABASE_KEY=
GOOGLE_PLACES_API_KEY=
GOOGLE_PAGESPEED_API_KEY=
YELP_API_KEY=
FRONTEND_URL=                  # your Vercel URL, for CORS
SCRIPT_API_TOKEN=              # generate: python -c "import secrets; print(secrets.token_hex(32))"

# Frontend (safe to expose — Vite PUBLIC_ prefix)
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
```

---

## Lead scoring

Score is 0–100. Higher = more likely to need digital services = better prospect.

| Signal | Points |
|---|---|
| No website | +40 |
| Website fails mobile | +20 |
| PageSpeed mobile < 50 | +15 |
| No HTTPS | +10 |
| Fewer than 10 reviews | +10 |
| Not on Yelp | +5 |

Priority buckets: **high** (60+) · **medium** (30–59) · **low** (<30)

Scores recalculate on every enrichment update, not just on initial scrape.

---

## Database schema

Table: `leads`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `business_name` | text | |
| `address` | text | |
| `phone` | text | |
| `website_url` | text | nullable |
| `google_place_id` | text | unique — dedup key |
| `google_rating` | float | |
| `review_count` | int | |
| `has_website` | boolean | |
| `has_https` | boolean | |
| `has_gbp` | boolean | has Google Business Profile |
| `pagespeed_mobile` | int | 0–100 |
| `pagespeed_desktop` | int | 0–100 |
| `mobile_friendly` | boolean | |
| `also_on_yelp` | boolean | |
| `yelp_url` | text | nullable |
| `lead_score` | int | 0–100 |
| `priority` | text | `high` / `medium` / `low` |
| `status` | text | `cold` / `contacted` / `proposal` / `closed_won` / `closed_lost` |
| `notes` | text | nullable |
| `created_at` | timestamptz | |
| `last_updated` | timestamptz | |

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/leads` | List leads with filters |
| `GET` | `/leads/{id}` | Single lead |
| `PATCH` | `/leads/{id}` | Update status / notes |
| `DELETE` | `/leads/{id}` | Delete a lead |
| `GET` | `/leads/export` | TSV export (Google Sheets compatible) |
| `POST` | `/scrapes` | Trigger a scrape |
| `POST` | `/enrichment/{id}` | Enrich a single lead |
| `POST` | `/enrichment/rescore` | Re-score all leads |
| `GET` | `/health` | Health check |

---

## Deployment

**Backend → Render**
- Set all backend env vars in Render dashboard
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**Frontend → Vercel**
- Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in Vercel project settings
- Deploys automatically on push to `main`

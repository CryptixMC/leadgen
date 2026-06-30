# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Internal lead generation and CRM tool for Liam Nicholson Business Tech Consulting.
Pulls small business leads from Google Places API + Yelp, scores them automatically,
and presents them in a SvelteKit dashboard. Includes AI-powered email generation via
Gemini and outreach tracking.

Goal: ranked, actionable cold outreach leads with zero manual data entry.

---

## Commands

```bash
# Install dependencies
npm install

# Run dev server (SvelteKit on :5173)
npm run dev

# Type-check
npm run check

# Build for production
npm run build
```

---

## Repo Structure

```
leadgen/
├── src/
│   ├── lib/
│   │   ├── api.ts                  # client-side fetch wrappers + Lead/Client types
│   │   ├── supabase.js             # Supabase browser client (SSR-safe, null during SSR)
│   │   ├── emailTemplates.ts       # email template definitions
│   │   ├── index.ts                # barrel export
│   │   ├── assets/                 # static images/icons
│   │   ├── components/             # shared Svelte components
│   │   └── server/                 # server-only modules (never imported client-side)
│   │       ├── auth.ts             # JWT validation helper
│   │       ├── db.ts               # Supabase admin client singleton
│   │       ├── enrichment.ts       # enrichment pipeline (PageSpeed, Yelp, DuckDuckGo)
│   │       ├── scraper.ts          # Google Places API scraper
│   │       ├── scoring.ts          # lead scoring — single source of truth
│   │       ├── email.ts            # Nodemailer setup
│   │       ├── gemini.ts           # Gemini AI email draft generation
│   │       └── utils.ts            # URL validation helpers
│   ├── routes/
│   │   ├── +layout.server.ts       # auth guard — redirects to /login if no session
│   │   ├── +layout.svelte          # nav + global styles
│   │   ├── +page.svelte            # lead dashboard (table, filters, batch delete, create)
│   │   ├── +page.ts                # load leads on mount
│   │   ├── api/                    # SvelteKit API routes (server-only)
│   │   │   ├── health/             # GET /api/health — no auth required
│   │   │   ├── leads/              # GET/POST /api/leads, batch DELETE
│   │   │   │   ├── [id]/           # GET/PATCH/DELETE /api/leads/[id]
│   │   │   │   │   ├── enrich/     # POST — run enrichment pipeline
│   │   │   │   │   ├── generate-email/  # POST — Gemini draft
│   │   │   │   │   └── send-email/ # POST — send via SMTP
│   │   │   │   ├── export/         # GET — TSV download
│   │   │   │   ├── geocode-missing/# POST — fill missing lat/lng
│   │   │   │   └── rescore/        # POST — re-enrich + rescore all
│   │   │   └── scrapes/            # POST /api/scrapes — trigger Places scrape
│   │   ├── leads/[id]/             # lead detail page, status/notes editing
│   │   ├── clients/                # clients list + individual client pages
│   │   ├── map/                    # Leaflet map of geocoded leads
│   │   ├── analytics/              # dashboard stats + charts
│   │   ├── pipeline/               # Kanban / sales pipeline view
│   │   ├── scraper/                # UI to trigger scrapes
│   │   └── login/                  # Supabase email/password sign-in
│   └── app.html                    # root HTML template
├── supabase/
│   └── migrations/                 # SQL migrations (apply in filename order)
├── static/                         # public assets
├── .claude/                        # Claude Code config
│   ├── skills/run-lead-generator/  # skill: start + smoke-test the app
│   └── settings.json               # project-level Claude permissions
├── .mcp.json                       # MCP servers (root-level — required by Claude Code)
├── .env.example                    # env var template
├── flake.nix                       # Nix dev shell (Node.js 22)
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

---

## Stack

| Layer | Tool | Notes |
|---|---|---|
| Database | Supabase (Postgres) | Hosted, free tier |
| App | SvelteKit (Svelte 5 + TypeScript) | Hosted on Vercel |
| Scraping | Google Places API | Text + nearby search, page-token pagination |
| Enrichment | Google PageSpeed Insights + Yelp Fusion + DuckDuckGo | |
| Email | Nodemailer (Proton Mail SMTP) | smtp.proton.me:587, no Bridge needed |
| AI | Gemini 2.0 Flash | Email draft generation |

---

## Authentication

All `/api/*` routes (except `/api/health`) require a `Bearer` token validated in
`src/lib/server/auth.ts` against Supabase.

Frontend flow: `+layout.server.ts` reads the `sb_access_token` cookie on every SSR load
and redirects to `/login` if absent. Client-side calls use `getClientToken()` from
`src/lib/api.ts` to read the cookie.

The Supabase browser client in `src/lib/supabase.js` returns `null` during SSR —
never call it in server modules.

---

## Database Schema

### `leads`

```sql
id                   uuid primary key
business_name        text
address              text
phone                text
website_url          text nullable
google_place_id      text unique
google_rating        float
review_count         int
has_gbp              boolean        -- has Google Business Profile
has_website          boolean
has_https            boolean
pagespeed_mobile     int            -- 0–100
pagespeed_desktop    int            -- 0–100
pagespeed_seo        int            -- 0–100
pagespeed_best_practices int        -- 0–100
mobile_friendly      boolean
website_inferred     boolean        -- true if URL was discovered, not from GBP
website_screenshot   text nullable  -- base64 data URI from PageSpeed final-screenshot
email                text nullable
site_age_estimate    text
also_on_yelp         boolean
yelp_url             text nullable
facebook_url         text nullable
instagram_url        text nullable
twitter_url          text nullable
linkedin_url         text nullable
tiktok_url           text nullable
youtube_url          text nullable
latitude             float nullable
longitude            float nullable
lead_score           int            -- 0–100, higher = better prospect
priority             text           -- 'high' | 'medium' | 'low'
status               text           -- 'cold' | 'contacted' | 'proposal' | 'closed_won' | 'closed_lost'
notes                text nullable
created_at           timestamptz
last_updated         timestamptz
```

### `clients`

```sql
id               uuid primary key
lead_id          uuid references leads(id) on delete set null
business_name    text
contact_name     text
phone            text
email            text
address          text
service_website  boolean
service_tools    boolean
service_hosting  boolean
mrr              numeric(8,2)
project_value    numeric(8,2)
contract_start   date
notes            text
created_at       timestamptz
```

### `contact_events`

```sql
id         uuid primary key
lead_id    uuid references leads(id) on delete cascade
type       text
notes      text
created_at timestamptz
```

---

## Lead Scoring Logic

Score is 0–100, capped. Higher = stronger prospect. Source: `src/lib/server/scoring.ts`.

| Signal | Points |
|---|---|
| No website at all | +40 |
| Website inferred (discovered, not from GBP) | +20 |
| Website fails mobile (`mobile_friendly == false`) | +20 |
| PageSpeed mobile 0–24 | +20 |
| PageSpeed mobile 25–49 | +15 |
| PageSpeed mobile 50–74 | +5 |
| PageSpeed SEO < 50 | +10 |
| PageSpeed SEO 50–79 | +5 |
| PageSpeed best practices < 50 | +10 |
| PageSpeed best practices 50–79 | +5 |
| No HTTPS | +10 |
| Review count under 10 | +10 |
| Not on Yelp (only when `has_gbp` is true) | +5 |

Priority:
- Score 60+ → `high`
- Score 30–59 → `medium`
- Score < 30 → `low`

---

## Enrichment Pipeline

`runEnrichment()` in `src/lib/server/enrichment.ts`:

1. **URL cleanup** — strips social media URLs and follows redirects to detect aggregator landing pages. Helpers in `utils.ts`.
2. **Website discovery** — if no valid URL, DuckDuckGo-searches `"business name" "city"` and takes the first non-directory, non-social result. Sets `website_inferred = true`.
3. **PageSpeed** — mobile + desktop performance, SEO, best-practices; extracts `final-screenshot` base64. All `category` params must be requested explicitly.
4. **Homepage scrape** — extracts email from `mailto:` links (then regex fallback), estimates site age from copyright year or `Last-Modified` header.
5. **Yelp** — cross-references by city substring + phone digit comparison to avoid false positives.

Score recalculates after every enrichment run.

---

## API Endpoints

All routes require `Authorization: Bearer <token>` except `/api/health`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Health check, no auth |
| GET | `/api/leads` | List — filterable by `?status=` and `?priority=`, score desc |
| POST | `/api/leads` | Create manual lead |
| DELETE | `/api/leads` | Batch delete — body: `{ "ids": [...] }` |
| GET | `/api/leads/export` | TSV download, score-sorted |
| POST | `/api/leads/geocode-missing` | Fill null lat/lng via Places Details API |
| POST | `/api/leads/rescore` | Re-enrich + rescore all leads |
| GET | `/api/leads/[id]` | Single lead |
| PATCH | `/api/leads/[id]` | Update `status` and/or `notes` |
| DELETE | `/api/leads/[id]` | Delete lead |
| POST | `/api/leads/[id]/enrich` | Run enrichment pipeline |
| POST | `/api/leads/[id]/generate-email` | Generate AI email draft via Gemini |
| POST | `/api/leads/[id]/send-email` | Send email via SMTP |
| POST | `/api/scrapes` | Trigger Google Places scrape |

---

## Environment Variables

```env
# Supabase
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# APIs
GOOGLE_PLACES_API_KEY=
GOOGLE_PAGESPEED_API_KEY=
YELP_API_KEY=
GEMINI_API_KEY=

# Email (Proton Mail SMTP — no Bridge needed)
SMTP_HOST=smtp.proton.me
SMTP_PORT=587
SMTP_USER=you@yourdomain.com
SMTP_PASS=
SMTP_FROM="Liam Nicholson <you@yourdomain.com>"
SMTP_SIGNATURE_URL=https://yoursite.vercel.app/email-signature-A.png
```

Copy `.env.example` to `.env`. Never commit `.env`.

---

## Claude / MCP Config

All Claude Code project config lives under `.claude/`:
- `.claude/settings.json` — project-level permissions
- `.claude/skills/run-lead-generator/` — skill to launch + smoke-test the app

`.mcp.json` must stay at the repo root (Claude Code reads it there). It currently
configures the Supabase MCP server for direct DB access during development.

---

## Conventions

- **Svelte 5 runes** (`$state`, `$derived`, `$props`) — no Svelte 4 stores.
- All server logic lives in `src/lib/server/` — never imported client-side.
- Client data fetching goes only through `src/lib/api.ts` — never calls Supabase directly.
- API routes live in `src/routes/api/` as SvelteKit `+server.ts` files.
- `google_place_id` is the unique key — no duplicate leads. Manual leads get `manual_<uuid>`.
- Lead score recalculates on every enrichment update.
- Status and notes are the only fields the UI can write — enrichment owns everything else.
- Social media and aggregator URLs must be filtered before saving `website_url` — use `utils.ts` helpers.
- Scraper handles 429s with exponential backoff in `scraper.ts`.
- Never hardcode API keys — always use `import { env } from '$env/dynamic/private'`.

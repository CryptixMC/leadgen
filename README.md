# Lead Generator

Internal lead generation and CRM tool for small business cold outreach. Pulls leads from Google Places and Yelp, scores them automatically based on digital presence gaps, and presents them in a review UI with actionable insights.

Built for Liam Nicholson Business Tech Consulting.

---

## What it does

1. **Scrapes** small businesses by category and city via Google Places API (with page-token pagination)
2. **Enriches** each lead — PageSpeed scores, HTTPS check, homepage email extraction, site age estimation, Yelp cross-reference
3. **Scores** leads 0–100 based on digital weakness signals (no website, slow mobile, poor SEO, no HTTPS, etc.)
4. **Presents** them in a SvelteKit dashboard with filtering, notes, status tracking, batch operations, and a map view
5. **Generates & sends emails** using Gemini AI for personalized outreach

Goal: ranked, actionable cold outreach leads with zero manual data entry and AI-powered email campaigns.

---

## Stack

| Layer | Tool | Hosting |
|---|---|---|
| Database | Supabase (Postgres) | Supabase cloud |
| Backend & Frontend | SvelteKit (Svelte 5 + TypeScript) | Vercel |
| Scraping | Google Places API | — |
| Enrichment | Google PageSpeed Insights + Yelp Fusion + DuckDuckGo | — |
| Email | Nodemailer (SMTP via Proton Mail) | — |
| AI | Gemini 2.0 Flash | — |

---

## Repo structure

```
leadgen/
├── src/
│   ├── lib/
│   │   ├── api.ts                   # client-side API fetch functions + types
│   │   ├── supabase.js              # Supabase client (browser-safe)
│   │   ├── emailTemplates.ts        # email template definitions
│   │   ├── assets/                  # static images/icons
│   │   ├── docs/                    # documentation
│   │   └── server/
│   │       ├── auth.ts              # auth helpers
│   │       ├── db.ts                # Supabase client
│   │       ├── enrichment.ts        # enrichment pipeline (PageSpeed, Yelp, DuckDuckGo)
│   │       ├── scraper.ts           # Google Places API scraper
│   │       ├── scoring.ts           # lead scoring logic
│   │       ├── email.ts             # Nodemailer setup
│   │       ├── gemini.ts            # Gemini AI email generation
│   │       └── utils.ts             # helpers (URL validation, etc.)
│   ├── routes/
│   │   ├── +layout.server.ts        # auth guard, load session
│   │   ├── +layout.svelte           # main layout, nav
│   │   ├── +page.svelte             # lead dashboard
│   │   ├── +page.ts                 # fetch leads on load
│   │   ├── api/                     # SvelteKit API routes
│   │   │   ├── leads/               # lead CRUD, enrich, email
│   │   │   ├── scrapes/             # trigger scrapes
│   │   │   └── health/              # health check
│   │   ├── leads/[id]/              # lead detail, editing, enrichment
│   │   ├── clients/                 # clients list & management
│   │   ├── map/                     # geocoded lead map view
│   │   ├── analytics/               # dashboard stats & charts
│   │   ├── pipeline/                # sales pipeline / Kanban view
│   │   ├── scraper/                 # UI to trigger scrapes
│   │   └── login/                   # Supabase auth sign-in
│   └── app.html                     # root HTML template
├── supabase/
│   └── migrations/                  # SQL migrations for leads, clients, etc.
├── static/                          # public assets
├── package.json                     # dependencies
├── svelte.config.js                 # SvelteKit config + Vercel adapter
├── vite.config.ts                   # Vite build config
├── tsconfig.json                    # TypeScript config
└── .env.example                     # environment variables template
```

---

## Local setup

### Prerequisites

- Node.js 18+
- A Supabase project
- Google Places API key
- Google PageSpeed Insights API key
- Yelp Fusion API key
- Gemini API key (for AI email generation)
- Proton Mail credentials (or other SMTP server)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Fill in .env with your API keys and Supabase credentials

# Run dev server
npm run dev

# Visit http://localhost:5173
```

### Build for production

```bash
npm run build
npm run preview
```

---

## Environment variables

Create a `.env` file in the root (copy from `.env.example`). Never commit `.env`.

```env
# Supabase — backend database
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# APIs
GOOGLE_PLACES_API_KEY=
GOOGLE_PAGESPEED_API_KEY=
YELP_API_KEY=
GEMINI_API_KEY=

# Email (Proton Mail or other SMTP)
SMTP_HOST=smtp.proton.me
SMTP_PORT=587
SMTP_USER=you@yourdomain.com
SMTP_PASS=
SMTP_FROM="Liam Nicholson <you@yourdomain.com>"
SMTP_SIGNATURE_URL=https://yoursite.vercel.app/signature.png
```

---

## Lead scoring

Score is **0–100**. Higher = stronger prospect for digital services.

| Signal | Points |
|---|---|
| No website at all | +40 |
| Website inferred (discovered, not from GBP) | +20 |
| Website fails mobile | +20 |
| PageSpeed mobile 0–24 | +20 |
| PageSpeed mobile 25–49 | +15 |
| PageSpeed mobile 50–74 | +5 |
| PageSpeed SEO < 50 | +10 |
| PageSpeed SEO 50–79 | +5 |
| PageSpeed best practices < 50 | +10 |
| PageSpeed best practices 50–79 | +5 |
| No HTTPS | +10 |
| Fewer than 10 reviews | +10 |
| Not on Yelp (when has GBP) | +5 |

**Priority buckets:**
- `high` (60+)
- `medium` (30–59)
- `low` (<30)

Scores recalculate on every enrichment run.

---

## Database schema

### Table: `leads`

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
| `pagespeed_seo` | int | 0–100 |
| `pagespeed_best_practices` | int | 0–100 |
| `mobile_friendly` | boolean | |
| `website_inferred` | boolean | true if URL was discovered via DuckDuckGo |
| `website_screenshot` | text | nullable — base64 data URI from PageSpeed |
| `email` | string | nullable — extracted from homepage |
| `site_age_estimate` | text | nullable — from copyright year or Last-Modified header |
| `also_on_yelp` | boolean | |
| `yelp_url` | text | nullable |
| `latitude` | float | nullable — geocoded |
| `longitude` | float | nullable — geocoded |
| `lead_score` | int | 0–100 |
| `priority` | text | `high` / `medium` / `low` |
| `status` | text | `cold` / `contacted` / `proposal` / `closed_won` / `closed_lost` |
| `hidden` | boolean | whether lead is hidden from dashboard view |
| `notes` | text | nullable |
| `created_at` | timestamptz | |
| `last_updated` | timestamptz | |

### Table: `clients`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `lead_id` | uuid | nullable — can be converted from a lead |
| `business_name` | text | |
| `contact_name` | text | nullable |
| `phone` | text | nullable |
| `email` | text | nullable |
| `address` | text | nullable |
| `service_website` | boolean | website design/dev |
| `service_tools` | boolean | automation/tools |
| `service_hosting` | boolean | hosting/devops |
| `mrr` | float | monthly recurring revenue |
| `project_value` | float | total project value |
| `contract_start` | timestamptz | nullable |
| `notes` | text | nullable |
| `created_at` | timestamptz | |

---

## API endpoints

All routes are SvelteKit server-side endpoints (under `src/routes/api/`).

### Leads

| Method | Path | Description |
|---|---|---|
| GET | `/api/leads` | List leads, filterable by `?status=` and `?priority=` |
| POST | `/api/leads` | Create manual lead |
| GET | `/api/leads/[id]` | Single lead |
| PATCH | `/api/leads/[id]` | Update `status` and/or `notes` |
| DELETE | `/api/leads/[id]` | Delete single lead |
| PATCH | `/api/leads` | Batch update (hide/show leads by id array) |
| POST | `/api/leads/[id]/enrich` | Run enrichment pipeline |
| POST | `/api/leads/[id]/send-email` | Send email to lead |
| POST | `/api/leads/[id]/generate-email` | Generate email subject + body via Gemini |
| POST | `/api/leads/geocode-missing` | Fill lat/lng for leads without coordinates |
| POST | `/api/leads/rescore` | Re-enrich and re-score all leads |

### Scrapes

| Method | Path | Description |
|---|---|---|
| POST | `/api/scrapes` | Trigger Places API scrape (`{ category, city, target }`) |

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |

---

## Authentication

All routes require Supabase JWT in the `Authorization: Bearer <token>` header, except `/api/health`.

**Frontend auth flow:**
- `+layout.server.ts` checks for Supabase session on every request
- If missing, redirects to `/login`
- Sign-in via Supabase email/password
- JWT stored as `sb_access_token` cookie (httponly)
- API calls automatically include the token

---

## Enrichment pipeline

`enrichLead()` in `src/lib/server/enrichment.ts` runs:

1. **URL cleanup** — removes social media (Facebook, Instagram) and aggregator URLs (DoorDash, SkipTheDishes, etc.)
2. **Website discovery** — if no valid URL, searches DuckDuckGo and returns first non-directory result. Sets `website_inferred = true`.
3. **PageSpeed** — fetches mobile + desktop scores (performance, SEO, best-practices); extracts screenshot base64
4. **Homepage scrape** — fetches homepage, extracts email from `mailto:` links + regex, estimates site age
5. **Yelp matching** — matches by city substring + phone digit comparison

Score recalculates after every enrichment run.

---

## Email & AI

**Email sending** (`src/lib/server/email.ts`):
- Nodemailer via Proton Mail SMTP
- Signature included from `SMTP_SIGNATURE_URL`

**Email generation** (`src/lib/server/gemini.ts`):
- Uses Gemini 2.0 Flash to generate personalized subject lines and body text
- Accepts template + lead details + sender name + extra context
- Returns generated subject and body ready to send

---

## Deployment

Deployed on **Vercel** as a single SvelteKit project.

**Setup:**
1. Connect repo to Vercel
2. Set environment variables in Vercel project settings (see `.env.example`)
3. Set build command: `npm run build`
4. Set output directory: `.svelte-kit/output`
5. Deploy

The `@sveltejs/adapter-vercel` is configured in `svelte.config.js` for serverless deployment.

---

## Development conventions

- **Frontend & Backend:** Single SvelteKit app (routes, lib, etc.)
- **API routes:** All under `src/routes/api/` using SvelteKit server handlers
- **Server code:** Never runs on client; keep it in `src/lib/server/`
- **Database:** Supabase client initialized once in `src/lib/server/db.ts`
- **API keys:** Always use `process.env` — never hardcode
- **Rate limits:** Handled gracefully in scrapers (exponential backoff)
- **Error handling:** PageSpeed/Yelp failures don't block lead saves
- **Dedup key:** `google_place_id` is unique
- **Data flow:** Frontend calls SvelteKit API routes, never Supabase directly
- **Svelte 5:** Uses runes (`$state`, `$derived`, `$props`)

---

## Key rules

- Never commit `.env` — use `.env.example` for templates
- All server-side code goes in `src/lib/server/`
- Ensure CORS headers are set if frontend and backend differ
- Email templates are centralized in `src/lib/emailTemplates.ts`
- Migrations live in `supabase/migrations/` for reproducibility

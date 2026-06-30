---
name: run-lead-generator
description: Run, start, launch, screenshot, smoke test, or verify the lead-generator app — SvelteKit on :5173
---

# run-lead-generator

Unified SvelteKit app (`:5173`). The driver is
`.claude/skills/run-lead-generator/smoke.sh` — starts the dev server,
waits for readiness, and runs smoke checks.

---

## Prerequisites

- **Node modules**: `npm install` from repo root
- **Env file**: `.env` copied from `.env.example` with real values.
  At minimum `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` are needed
  to render the login page. Without `SUPABASE_SERVICE_ROLE_KEY` all API calls
  return 401/500.

---

## Agent path — smoke.sh

```bash
# Start dev server + verify (from repo root):
bash .claude/skills/run-lead-generator/smoke.sh

# If the server is already running:
bash .claude/skills/run-lead-generator/smoke.sh --check

# Stop the process started by this script:
bash .claude/skills/run-lead-generator/smoke.sh --stop
```

**Smoke checks:**

| Check | Expected |
|---|---|
| `GET /api/health` | `{"status":"ok"}` |
| `GET /api/leads` (no auth) | HTTP 401 |
| `GET /login` HTML | `<title>` contains `LeadGen` or `Sign In` |

Logs go to `/tmp/leadgen-frontend.log`.

---

## Screenshots (headless)

```bash
nix run nixpkgs#chromium -- \
  --headless=new --no-sandbox --disable-gpu \
  --screenshot=/tmp/leadgen-login.png \
  --window-size=1280,900 \
  http://localhost:5173/login
```

---

## Manual path

```bash
npm run dev
# visit http://localhost:5173/
```

---

## Gotchas

- **`/` redirects to `/login`** — the layout guard checks for `sb_access_token` cookie.
  Smoke check hits `/login` directly.
- **Port can shift** — Vite picks the next free port if 5173 is taken. Check stdout.

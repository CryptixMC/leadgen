---
name: run-lead-generator
description: Run, start, launch, screenshot, smoke test, or verify the lead-generator app — FastAPI backend on :8000 and SvelteKit frontend on :5173
---

# run-lead-generator

FastAPI backend (`:8000`) + SvelteKit frontend (`:5173`). The driver is
`.claude/skills/run-lead-generator/smoke.sh` — it starts both processes,
waits for readiness, and verifies all three smoke checks in one shot.
Screenshots use nix-provided Chromium headless (no display required).

All paths below are relative to the repo root (`lead-generator/`).

---

## Prerequisites

No apt-get installs needed. Everything is self-contained:

- **Python venv**: `backend/.venv` — created by `nix develop` or manually
  with `uv venv backend/.venv --python python3.11`
- **Node modules**: `frontend/node_modules` — `cd frontend && npm install`
- **Chromium** (screenshots only): `nix run nixpkgs#chromium -- --version`
  first run downloads ~135 MB to the nix store; subsequent runs are instant

**Env files are required** — without them the backend starts but all API
calls that hit Supabase/Google/Yelp return 500:

- `backend/.env` — copy from CLAUDE.md env-var list; needs at minimum
  `SUPABASE_URL` and `SUPABASE_KEY` to serve authenticated routes
- `frontend/.env` — copy from `frontend/.env.example`; needs
  `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` to render the
  login page with real auth

---

## Agent path — smoke.sh

```bash
# Start both services + verify (from repo root):
bash .claude/skills/run-lead-generator/smoke.sh

# If both servers are already running:
bash .claude/skills/run-lead-generator/smoke.sh --check

# Stop the processes started by this script:
bash .claude/skills/run-lead-generator/smoke.sh --stop
```

**What the smoke checks verify:**

| Check | Expected |
|---|---|
| `GET /health` | `{"status":"ok"}` |
| `GET /leads` (no auth header) | HTTP 401 |
| `GET /login` (frontend HTML) | `<title>Sign In — LeadGen</title>` |

Logs go to `/tmp/leadgen-backend.log` and `/tmp/leadgen-frontend.log`.

---

## Screenshots (headless, no display needed)

```bash
nix run nixpkgs#chromium -- \
  --headless=new --no-sandbox --disable-gpu \
  --screenshot=/tmp/leadgen-login.png \
  --window-size=1280,900 \
  http://localhost:5173/login
```

The `Failed to call method: org.freedesktop.DBus.Properties.Get` DBUS
warning in stderr is harmless — the screenshot file is still written.

---

## Manual / human path

```bash
# Backend:
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Frontend (separate terminal):
cd frontend
npm run dev
# opens http://localhost:5173/
```

`--reload` watches `backend/` for file changes. The frontend dev server
(Vite) hot-reloads automatically.

---

## Gotchas

- **`/` redirects to `/login`** — the SvelteKit layout guard (`+layout.server.js`)
  checks for `sb_access_token` cookie. `GET /` returns HTTP 303, not 200.
  The smoke check hits `/login` directly to bypass this.

- **Frontend port is 5173 by default but can shift** — Vite picks the next
  free port if 5173 is taken. Check the dev server stdout: `Local: http://localhost:XXXX/`.

- **Backend requires `.env` to start correctly** — if `backend/.env` is
  missing, uvicorn starts fine but every request hitting Supabase returns
  a 500. The health check (`GET /health`) passes regardless since it
  doesn't touch Supabase.

- **`--reload` uses a subprocess** — the PID written to
  `/tmp/leadgen-backend.pid` is the reloader process. When you `--stop`,
  killing it also kills the worker. Without `--reload`, kill is instant.

- **`nix run nixpkgs#chromium` first run downloads 135 MB** — subsequent
  invocations are instant (path is `/nix/store/*-chromium-*/bin/chromium`).
  The exact store path changes with version; always use `nix run` in scripts
  rather than hardcoding the store path.

---

## Troubleshooting

**`source .venv/bin/activate` — no such file**
→ `cd backend && uv venv .venv --python python3.11 && pip install -r requirements.txt`

**Frontend: `npm run dev` — `sh: vite: command not found`**
→ `cd frontend && npm install`

**`GET /leads` returns 500 instead of 401**
→ `auth.py` failed to load Supabase client. Check `backend/.env` has `SUPABASE_URL` and `SUPABASE_KEY`.

**`GET /login` returns blank page**
→ Frontend `.env` missing `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`. Copy from `frontend/.env.example` and fill in values.

**Chromium DBUS error on screenshot**
→ `Failed to call method: org.freedesktop.DBus.Properties.Get` — harmless on NixOS, the PNG is written despite the warning.

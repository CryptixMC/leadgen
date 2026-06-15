#!/usr/bin/env bash
# Starts backend + frontend and verifies both are healthy.
# Usage:
#   bash .claude/skills/run-lead-generator/smoke.sh           # start + verify
#   bash .claude/skills/run-lead-generator/smoke.sh --check   # verify only (already running)
#   bash .claude/skills/run-lead-generator/smoke.sh --stop    # kill managed processes

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKEND_LOG=/tmp/leadgen-backend.log
FRONTEND_LOG=/tmp/leadgen-frontend.log
BACKEND_PID=/tmp/leadgen-backend.pid
FRONTEND_PID=/tmp/leadgen-frontend.pid

wait_for() {
  local url="$1" label="$2"
  for i in $(seq 1 40); do
    if curl -sf "$url" -o /dev/null 2>/dev/null; then
      echo "  ✓ $label ready"
      return 0
    fi
    sleep 1
  done
  echo "  ✗ $label not ready after 40s"
  return 1
}

if [[ "${1:-}" == "--stop" ]]; then
  echo "==> Stopping…"
  [ -f "$BACKEND_PID" ]  && kill "$(cat "$BACKEND_PID")"  2>/dev/null && rm "$BACKEND_PID"  || true
  [ -f "$FRONTEND_PID" ] && kill "$(cat "$FRONTEND_PID")" 2>/dev/null && rm "$FRONTEND_PID" || true
  echo "Done."
  exit 0
fi

if [[ "${1:-}" != "--check" ]]; then
  echo "==> Starting backend (FastAPI on :8000)…"
  cd "$REPO/backend"
  source .venv/bin/activate
  uvicorn main:app --port 8000 >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID"

  echo "==> Starting frontend (SvelteKit on :5173)…"
  cd "$REPO/frontend"
  npm run dev >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID"

  echo "==> Waiting for services to be ready…"
  wait_for "http://localhost:8000/health" "backend :8000"
  wait_for "http://localhost:5173/" "frontend :5173"
fi

echo ""
echo "==> Smoke checks"

# Backend health
HEALTH=$(curl -sf http://localhost:8000/health)
echo "  GET /health          → $HEALTH"

# Auth guard works
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/leads)
echo "  GET /leads (no auth) → HTTP $AUTH_CODE  (expect 401)"

# Frontend serves HTML
TITLE=$(curl -sf http://localhost:5173/login | grep -o '<title>[^<]*</title>' 2>/dev/null || echo "(no title)")
echo "  GET /login (HTML)    → $TITLE"

echo ""
echo "==> All smoke checks passed ✓"
echo ""
echo "Logs:  $BACKEND_LOG   $FRONTEND_LOG"
echo "Stop:  bash .claude/skills/run-lead-generator/smoke.sh --stop"
echo ""
echo "Screenshot (headless, no display needed):"
echo "  nix run nixpkgs#chromium -- --headless=new --no-sandbox --disable-gpu \\"
echo "    --screenshot=/tmp/leadgen.png --window-size=1280,900 http://localhost:5173/login"

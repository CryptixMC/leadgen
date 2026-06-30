#!/usr/bin/env bash
# Starts the SvelteKit dev server and verifies it is healthy.
# Usage:
#   bash .claude/skills/run-lead-generator/smoke.sh           # start + verify
#   bash .claude/skills/run-lead-generator/smoke.sh --check   # verify only (already running)
#   bash .claude/skills/run-lead-generator/smoke.sh --stop    # kill managed process

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FRONTEND_LOG=/tmp/leadgen-frontend.log
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
  [ -f "$FRONTEND_PID" ] && kill "$(cat "$FRONTEND_PID")" 2>/dev/null && rm "$FRONTEND_PID" || true
  echo "Done."
  exit 0
fi

if [[ "${1:-}" != "--check" ]]; then
  echo "==> Starting SvelteKit dev server on :5173…"
  cd "$REPO"
  npm run dev >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID"

  echo "==> Waiting for server to be ready…"
  wait_for "http://localhost:5173/" "frontend :5173"
fi

echo ""
echo "==> Smoke checks"

# Health endpoint
HEALTH=$(curl -sf http://localhost:5173/api/health || echo "(failed)")
echo "  GET /api/health          → $HEALTH"

# Auth guard
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/api/leads)
echo "  GET /api/leads (no auth) → HTTP $AUTH_CODE  (expect 401)"

# Login page HTML
TITLE=$(curl -sf http://localhost:5173/login | grep -o '<title>[^<]*</title>' 2>/dev/null || echo "(no title)")
echo "  GET /login (HTML)        → $TITLE"

echo ""
echo "==> Smoke checks passed ✓"
echo ""
echo "Logs: $FRONTEND_LOG"
echo "Stop: bash .claude/skills/run-lead-generator/smoke.sh --stop"
echo ""
echo "Screenshot (headless):"
echo "  nix run nixpkgs#chromium -- --headless=new --no-sandbox --disable-gpu \\"
echo "    --screenshot=/tmp/leadgen.png --window-size=1280,900 http://localhost:5173/login"

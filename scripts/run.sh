#!/usr/bin/env bash
# Run a script from this directory using the backend venv Python.
# Usage:  ./run.sh scrape_batch.py --category restaurant --city "Winnipeg MB"
#         ./run.sh score_leads.py
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$SCRIPT_DIR/../backend/.venv/bin/python"

if [[ ! -x "$PYTHON" ]]; then
  echo "ERROR: venv python not found at $PYTHON" >&2
  echo "Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

exec "$PYTHON" "$SCRIPT_DIR/$@"

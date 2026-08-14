#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/src/api"
WEB_DIR="$ROOT_DIR/src/web"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

command -v uv >/dev/null 2>&1 || {
  echo "Error: uv was not found. Install it from https://docs.astral.sh/uv/." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "Error: npm was not found. Install Node.js 24 or newer from https://nodejs.org/." >&2
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "Error: node was not found. Install Node.js 24 or newer from https://nodejs.org/." >&2
  exit 1
}

if [[ -z "${NEIS_API_KEY:-}" || "$NEIS_API_KEY" == "replace-with-your-neis-api-key" ]]; then
  echo "Error: set NEIS_API_KEY in the root .env file or in the current environment." >&2
  exit 1
fi

echo "Preparing API dependencies..."
(cd "$API_DIR" && uv sync --all-groups --frozen --quiet)

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  echo "Preparing web dependencies..."
  (cd "$WEB_DIR" && npm ci --no-audit --no-fund)
fi

if [[ -x "$API_DIR/.venv/bin/python" ]]; then
  python_command="$API_DIR/.venv/bin/python"
elif [[ -x "$API_DIR/.venv/Scripts/python.exe" ]]; then
  python_command="$API_DIR/.venv/Scripts/python.exe"
else
  echo "Error: the API virtual environment was not created." >&2
  exit 1
fi

api_pid=""
web_pid=""

cleanup() {
  trap - EXIT INT TERM
  [[ -n "$api_pid" ]] && kill "$api_pid" 2>/dev/null || true
  [[ -n "$web_pid" ]] && kill "$web_pid" 2>/dev/null || true
  [[ -n "$api_pid" ]] && wait "$api_pid" 2>/dev/null || true
  [[ -n "$web_pid" ]] && wait "$web_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd "$API_DIR" && exec "$python_command" -m uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000) &
api_pid=$!
(cd "$WEB_DIR" && exec node node_modules/vite/bin/vite.js --host 127.0.0.1) &
web_pid=$!

echo
echo "School Lunch app is starting:"
echo "  Web: http://localhost:5173"
echo "  API: http://localhost:8000/api/health"
echo "Press Ctrl+C to stop both servers."

set +e
wait -n "$api_pid" "$web_pid"
status=$?
set -e

echo "A development server stopped; shutting down both servers." >&2
exit "$status"

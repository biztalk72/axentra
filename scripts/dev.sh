#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then cp .env.example .env; fi
uv sync --directory backend --frozen
npm --prefix frontend ci --no-audit --no-fund
(cd backend && .venv/bin/uvicorn app.main:app --env-file ../.env --host 127.0.0.1 --port 8000) &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM
npm --prefix frontend run dev

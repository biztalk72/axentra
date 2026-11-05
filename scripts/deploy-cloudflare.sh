#!/usr/bin/env bash
# Auth: npx wrangler login, or externally supplied CLOUDFLARE_API_TOKEN / ACCOUNT_ID.
# Publishes the introduction at / and the browser-only product demo at /demo.html.
set -euo pipefail
cd "$(dirname "$0")/.."
npm --prefix frontend run build:pages
npx --yes wrangler@4.157.0 pages deploy frontend/dist \
  --project-name "${1:-axentra}" --branch main --commit-dirty=true

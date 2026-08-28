#!/bin/sh
set -e

# Prebuilt image (see Dockerfile) — .next/ and production node_modules
# already exist, baked in at `docker build` time (NEXT_PUBLIC_* vars were
# already fetched from SSM and inlined into the build then — see
# Dockerfile's build stage). This just fetches the runtime-only secrets
# (CLERK_SECRET_KEY, BETTERSTACK_*, etc. — read from process.env at
# request time, never inlined) and starts the app.

echo "[entrypoint] fetching secrets from AWS SSM Parameter Store..."
# Captured *before* sourcing fetch-secrets.sh, not after — SSM's
# /united-services/<env>/ path is a single flat namespace shared by both
# backend and frontend (confirmed live — it holds a PORT value meant for
# backend, 3002, which silently overrode this container's own 3000 the
# first time this ran), so anything docker-compose.yml itself is the
# source of truth for needs re-asserting after sourcing, not before.
OWN_PORT="$PORT"
OWN_INTERNAL_API_URL="$INTERNAL_API_URL"
# Only AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION need to exist
# in this container's environment already (passed straight through from
# the host's .env by docker-compose.yml, with no defaults) — every other
# secret/config this app needs is pulled from SSM here. See
# scripts/fetch-secrets.sh.
. ./scripts/fetch-secrets.sh
export PORT="$OWN_PORT"
export INTERNAL_API_URL="$OWN_INTERNAL_API_URL"

echo "[entrypoint] starting the app..."
export NODE_ENV=production
exec npm run start

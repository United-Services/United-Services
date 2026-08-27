#!/bin/sh
set -e

# Single-stage workflow: install -> fetch secrets -> build -> start, all at
# container start rather than baked into the image at `docker build` time.
#
# Secrets have to come BEFORE the build here, not after — every
# NEXT_PUBLIC_* var (Clerk publishable key, API URL, Clerk redirect URLs)
# gets inlined directly into the compiled JS by `next build`, at build
# time, not read at runtime like a normal env var. Building before secrets
# exist would bake in `undefined` for all of them.
#
# node_modules/.next only exist here at all if a previous start on this same
# container already produced them (single-stage: `COPY . .` at image build
# time never includes them) — `docker compose restart frontend` reuses the
# same container/filesystem, so a plain restart finds them already built
# and skips straight to fetching fresh secrets, rebuilding with them, and
# starting. A real redeploy (`docker compose up -d --build`) always gets a
# brand-new container with neither present, so the full install still runs
# then. Set FORCE_INSTALL=1 to force it on a restart (e.g. after
# hand-editing files in a running container).
if [ -d node_modules ] && [ "${FORCE_INSTALL:-}" != "1" ]; then
  echo "[entrypoint] node_modules already present, skipping npm install (set FORCE_INSTALL=1 to force)."
else
  echo "[entrypoint] installing frontend dependencies..."
  npm install
fi

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

echo "[entrypoint] building frontend..."
npm run build

echo "[entrypoint] starting the app..."
export NODE_ENV=production
exec npm run start

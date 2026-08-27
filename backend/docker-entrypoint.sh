#!/bin/sh
set -e

# Single-stage workflow, everything happens here at container start rather
# than baked into the image at `docker build` time:
#   install deps -> build -> fetch secrets from SSM -> migrate -> KEK ->
#   geoip -> start
# The order matters: secrets have to land in the environment (fetch-secrets)
# before anything that needs them (migrations need DATABASE_URL, the app
# itself needs everything) — nothing after that step should assume a var
# came from anywhere else.
#
# node_modules/dist only exist here at all if a previous start on this same
# container already produced them (single-stage: `COPY . .` at image build
# time never includes them) — `docker compose restart backend` reuses the
# same container/filesystem, so a plain restart finds them already built and
# skips straight to fetching fresh secrets + starting the app. A real
# redeploy (`docker compose up -d --build`) always gets a brand-new
# container with neither present, so the full install+build still runs
# then. Set FORCE_INSTALL=1 / FORCE_BUILD=1 to force either step on a
# restart (e.g. after hand-editing files in a running container).
if [ -d node_modules ] && [ "${FORCE_INSTALL:-}" != "1" ]; then
  echo "[entrypoint] node_modules already present, skipping npm install (set FORCE_INSTALL=1 to force)."
else
  echo "[entrypoint] installing backend dependencies..."
  npm install
fi

if [ -d dist ] && [ "${FORCE_BUILD:-}" != "1" ]; then
  echo "[entrypoint] dist/ already present, skipping npm run build (set FORCE_BUILD=1 to force)."
else
  echo "[entrypoint] building backend..."
  npm run build
fi

echo "[entrypoint] fetching secrets from AWS SSM Parameter Store..."
# Captured *before* sourcing fetch-secrets.sh, not after — SSM's
# /united-services/<env>/ path is a single flat namespace shared by both
# backend and frontend (confirmed live — it holds NEXT_PUBLIC_* vars
# alongside backend-only ones), so a PORT value meant for one service
# silently wins for the other once sourced. docker-compose.yml's own
# environment block is the actual source of truth for which port this
# container's healthcheck/nginx upstream expect it on — re-asserted
# below, after sourcing, so it can't be clobbered by SSM's copy.
OWN_PORT="$PORT"
# Only AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION need to exist
# in this container's environment already (passed straight through from
# the host's .env by docker-compose.yml, with no defaults) — every other
# secret this app needs is pulled from SSM here, not hardcoded anywhere
# in the Docker files. See scripts/fetch-secrets.sh.
. ./scripts/fetch-secrets.sh
export PORT="$OWN_PORT"

echo "[entrypoint] applying database migrations..."
node_modules/.bin/prisma migrate deploy

# Idempotent — only bootstraps a KEK on a genuinely fresh database (no
# KekRegistry rows at all). Re-running `kek:generate` on every container
# start would rotate keys on every deploy, which is not what we want;
# real rotation is a deliberate `npm run kek:generate` invocation, not
# something that happens implicitly on restart.
echo "[entrypoint] checking for an existing KEK..."
KEK_COUNT=$(node -e "
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
prisma.kekRegistry.count().then((c) => { console.log(c); return prisma.\$disconnect(); });
")

if [ "$KEK_COUNT" = "0" ]; then
  echo "[entrypoint] no KEK found — generating the first one..."
  node_modules/.bin/ts-node scripts/kek-generate.ts
else
  echo "[entrypoint] KEK already present ($KEK_COUNT row(s)), skipping generation."
fi

# Refreshes the GeoLite2-Country database GeoService reads at
# /app/geoip-db/GeoLite2-Country.mmdb (see docker-compose.yml's geoip-db
# volume). geoipupdate itself is idempotent/cheap when the DB is already
# current (conditional GET against MaxMind), so running this on every
# container start is fine — it's how this stays fresh across redeploys
# without a separate cron inside the container. Deliberately never fatal:
# GEOIP_MAXMIND_ACCOUNT_ID/LICENSE_KEY not being set (e.g. local dev,
# or this feature just not wired up yet in this environment) or the
# download itself failing must not block the app from starting —
# GeoService already falls back to 'en'/null on a missing/unreadable DB.
if [ -n "${GEOIP_MAXMIND_ACCOUNT_ID:-}" ] && [ -n "${GEOIP_MAXMIND_LICENSE_KEY:-}" ]; then
  echo "[entrypoint] updating GeoLite2-Country database..."
  GEOIP_CONF="$(mktemp)"
  {
    echo "AccountID ${GEOIP_MAXMIND_ACCOUNT_ID}"
    echo "LicenseKey ${GEOIP_MAXMIND_LICENSE_KEY}"
    echo "EditionIDs ${GEOIP_MAXMIND_EDITION_IDS:-GeoLite2-Country}"
    echo "DatabaseDirectory ${GEOIP_MAXMIND_DB_DIR:-/app/geoip-db}"
  } > "$GEOIP_CONF"
  if geoipupdate -f "$GEOIP_CONF" -d "${GEOIP_MAXMIND_DB_DIR:-/app/geoip-db}"; then
    echo "[entrypoint] GeoLite2-Country database is up to date."
  else
    echo "[entrypoint] WARNING: geoipupdate failed — continuing without an updated GeoIP database (GeoService falls back to 'en'/null lookups)." >&2
  fi
  rm -f "$GEOIP_CONF"
else
  echo "[entrypoint] GEOIP_MAXMIND_ACCOUNT_ID/LICENSE_KEY not set — skipping GeoIP database update."
fi

echo "[entrypoint] starting the app..."
# Set only now, not earlier/baked into the image — `npm install` above
# needs devDependencies (nest CLI, ts-node, prisma CLI, typescript) to
# actually be installed, and npm skips them entirely when NODE_ENV is
# already "production" at install time.
export NODE_ENV=production
# start:prod (not `start`, which is `nest start` — recompiles from source
# via the Nest CLI, ignoring the dist/ output `npm run build` just
# produced above) — this runs the actual built artifact.
exec npm run start:prod

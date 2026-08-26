#!/bin/sh
set -e

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
exec node dist/main.js

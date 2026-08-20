#!/usr/bin/env bash
# One-time (or per-rotation) migration tool: push real secrets from local
# backend/.env into AWS SSM Parameter Store. Run locally, with your own AWS
# credentials that have ssm:PutParameter on /united-services/*. Never run
# this in CI — it reads a local file with real secret values in it.
#
# Usage: scripts/push-secrets.sh [environment]
#   environment defaults to "staging" — pass "prod" explicitly for
#   production so a stray unqualified run never overwrites prod by
#   accident.
set -euo pipefail

# Resolve the repo root relative to this script's own location, so it works
# regardless of the caller's cwd (e.g. `./push-secrets.sh` from inside
# scripts/, or `scripts/push-secrets.sh` from the repo root).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Defaults to the app's own dedicated AWS profile rather than relying on
# whatever "default" happens to be configured on this machine (which may
# belong to an unrelated account/tool — that mismatch is exactly what broke
# this the first time). Override with `AWS_PROFILE=foo scripts/push-secrets.sh`
# if you deliberately want a different identity.
export AWS_PROFILE="${AWS_PROFILE:-united-services}"

ENVIRONMENT="${1:-staging}"
ENV_FILE="$REPO_ROOT/backend/.env.prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found." >&2
  exit 1
fi

# Keep this list in sync with docs/DEPLOYMENT.md's secret/non-secret
# classification table — intentionally explicit rather than "push
# everything" so a stray non-secret var added to .env later doesn't
# silently end up encrypted-and-forgotten in SSM, and a genuinely public
# NEXT_PUBLIC_* var never gets treated as if it needs protecting.
SECRET_KEYS=(
  DATABASE_URL
  DIRECT_URL
  NEXT_PUBLIC_CLERK_SIGN_IN_URL
  NEXT_PUBLIC_CLERK_SIGN_UP_URL
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
  CLERK_SECRET_KEY
  CLERK_PUBLISHABLE_KEY
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  CLERK_WEBHOOK_SECRET
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_REGION
  S3_BUCKET_NAME
  BETTERSTACK_SOURCE_TOKEN
  BETTERSTACK_INGEST_URL
  REDIS_URL
  NTFY_TOPIC_URL
  GEOIP_MAXMIND_ACCOUNT_ID
  GEOIP_MAXMIND_LICENSE_KEY
  GEOIP_MAXMIND_EDITION_IDS
  GEOIP_MAXMIND_DB_DIR
  WEBAUTHN_RP_ID
  WEBAUTHN_RP_ORIGIN
  API_GLOBAL_PREFIX
  PORT
  CORS_ORIGINS
  TOTP_KEK_PROVIDER
  KEK_KEYS_DIR
  LIBRETRANSLATE_URL
  TRANSLATION_MONTHLY_CHAR_BUDGET
  TRANSLATION_LOCK_TTL_MS
  TRANSLATION_SYNC_WAIT_MS
  ALERTING_ENABLED
  NTFY_TOPIC_URL
  SPRITE_KEY
  NGINX_PORT
  NEXT_PUBLIC_API_URL
)

echo "Pushing secrets to /united-services/${ENVIRONMENT}/* ..."
for key in "${SECRET_KEYS[@]}"; do
  # Strips optional surrounding quotes — backend/.env sometimes wraps
  # values in "double quotes" (e.g. connection strings), SSM shouldn't
  # store the literal quote characters as part of the value.
  # `grep` (correctly) exits nonzero when a key isn't in .env at all —
  # under `set -e`, that would otherwise kill the whole script right here
  # instead of hitting the "skip and warn" handling below, which is the
  # actual intended behavior for an optional/not-yet-set key. `|| true`
  # neutralizes that so the emptiness check further down is what decides.
  value=$( (grep -E "^${key}=" "$ENV_FILE" || true) | head -n1 | cut -d'=' -f2- | sed -E 's/^"(.*)"$/\1/')
  if [ -z "$value" ]; then
    echo "WARNING: $key not found (or empty) in $ENV_FILE, skipping" >&2
    continue
  fi
  aws ssm put-parameter \
    --name "/united-services/${ENVIRONMENT}/${key}" \
    --value "$value" \
    --type SecureString \
    --overwrite \
    --output text >/dev/null
  echo "  pushed $key"
done

echo "Done. Verify (never prints values): aws ssm get-parameters-by-path --path \"/united-services/${ENVIRONMENT}/\" --query \"Parameters[*].Name\""

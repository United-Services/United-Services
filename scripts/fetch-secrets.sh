#!/usr/bin/env bash
# Run on the server (or at the start of a deploy) to materialize
# backend/.env from SSM. Safe to commit — contains no secret values, only
# the mechanism. Requires AWS credentials with ssm:GetParametersByPath +
# kms:Decrypt scoped to /united-services/* — see docs/DEPLOYMENT.md's
# "Secrets management" section for the IAM policy and how the server
# authenticates to AWS at all.
#
# Only writes what's actually in SSM (the real secrets) — non-secret
# config (CORS_ORIGINS, WEBAUTHN_RP_ID, etc.) already has working defaults
# in docker-compose.yml's environment: block, so a Docker deploy needs
# nothing else. Only relevant if running the backend directly (not via
# docker-compose) with values docker-compose's defaults don't cover: set
# those in backend/.env yourself after running this, same as any other
# local override.
#
# Two of the fetched keys — BACKEND_POSTGRES_PASSWORD/
# BACKEND_REDIS_PASSWORD — are also written into the REPO-ROOT .env (in
# addition to backend/.env, below), because docker-compose.yml needs them
# to configure the postgres/redis services' own POSTGRES_PASSWORD/
# --requirepass at `docker compose up` time — a host-side, pre-container
# resolution that happens before docker-entrypoint.sh's own in-container
# SSM fetch ever runs. scripts/deploy.sh already calls this script before
# `docker compose pull && up`, so this is the one place that has to
# bridge the two. Existing lines in the root .env (AWS creds, APP_ENV,
# NGINX_PORT) are left untouched — only those two keys are updated/added.
# BACKEND_-prefixed (not plain POSTGRES_PASSWORD/REDIS_PASSWORD) so they
# can never be confused with support-agent's own identically-named vars,
# even though the two already live under separate SSM paths.
set -euo pipefail

# Resolve the repo root relative to this script's own location, so it works
# regardless of the caller's cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENVIRONMENT="${ENVIRONMENT:-staging}"
OUT="$REPO_ROOT/backend/.env"

# The aws CLI needs its own working credentials to reach SSM in the first
# place — those aren't something this script can fetch from SSM itself.
# If the caller's shell doesn't already have a working AWS identity (no
# active SSO session, no exported keys), fall back to the AWS_* keys
# already sitting in backend/.env from a previous run/manual setup, rather
# than failing with an opaque "security token invalid" from the aws CLI.
#
# Deliberately not `source <(...)` here: macOS still ships bash 3.2 at
# /bin/bash (Apple froze it there over the GPLv3 relicense), and that
# version doesn't reliably propagate variables out of a process
# substitution piped into `source` — they'd end up silently unset, with
# the aws CLI then falling back to whatever's in ~/.aws/credentials
# instead. A plain read loop over a here-string has no such issue.
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] && [ -f "$OUT" ]; then
  AWS_ENV_LINES="$(grep -E '^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|REGION)=' "$OUT")"
  while IFS='=' read -r key value; do
    [ -n "$key" ] && export "$key=$value"
  done <<< "$AWS_ENV_LINES"
fi
# Build into a temp file first and only replace the real target at the very
# end, once everything has actually succeeded — an aws CLI failure partway
# through (bad creds, network blip, wrong path) must never leave whatever
# was already in backend/.env destroyed. Same directory as OUT so the final
# mv is an atomic rename, not a cross-filesystem copy.
TMP="$(mktemp "$REPO_ROOT/backend/.env.fetch-secrets.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

echo "Fetching secrets from /united-services/${ENVIRONMENT}/ ..."
PARAMS="$(aws ssm get-parameters-by-path \
  --path "/united-services/${ENVIRONMENT}/" \
  --with-decryption \
  --query "Parameters[*].[Name,Value]" \
  --output text)"

if [ -z "$PARAMS" ]; then
  echo "ERROR: no parameters found under /united-services/${ENVIRONMENT}/ — leaving $OUT untouched." >&2
  exit 1
fi

# No associative arrays (bash 3.2, the macOS system default, doesn't
# support `declare -A` — see this script's other bash-3.2 note above) —
# just two plain variables, since there are only two keys to watch for.
root_pw=""
root_redis_pw=""

while IFS=$'\t' read -r name value; do
  key="${name##*/}"
  printf '%s=%s\n' "$key" "$value" >> "$TMP"
  case "$key" in
    BACKEND_POSTGRES_PASSWORD) root_pw="$value" ;;
    BACKEND_REDIS_PASSWORD) root_redis_pw="$value" ;;
  esac
done <<< "$PARAMS"

chmod 600 "$TMP"
mv "$TMP" "$OUT"
trap - EXIT
echo "Wrote $(wc -l < "$OUT" | tr -d ' ') lines to $OUT"

# Merge the two docker-compose-facing keys into the repo-root .env,
# in place — every other line there (AWS creds, APP_ENV, NGINX_PORT) is
# preserved untouched. Same atomic-temp-file-then-rename pattern as the
# write above, so a failure partway through never leaves the root .env
# half-written (that file also holds the AWS credentials this whole
# script needs to run at all).
if [ -n "$root_pw" ] || [ -n "$root_redis_pw" ]; then
  ROOT_ENV="$REPO_ROOT/.env"
  if [ ! -f "$ROOT_ENV" ]; then
    echo "ERROR: $ROOT_ENV does not exist — create it with the bootstrap AWS/APP_ENV/NGINX_PORT vars first (see docs/CREDENTIALS_CHECKLIST.md)." >&2
    exit 1
  fi
  ROOT_TMP="$(mktemp "$REPO_ROOT/.env.fetch-secrets.XXXXXX")"
  trap 'rm -f "$ROOT_TMP"' EXIT

  found_pw=0
  found_redis_pw=0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      BACKEND_POSTGRES_PASSWORD=*)
        if [ -n "$root_pw" ]; then printf 'BACKEND_POSTGRES_PASSWORD=%s\n' "$root_pw"; found_pw=1
        else printf '%s\n' "$line"; fi ;;
      BACKEND_REDIS_PASSWORD=*)
        if [ -n "$root_redis_pw" ]; then printf 'BACKEND_REDIS_PASSWORD=%s\n' "$root_redis_pw"; found_redis_pw=1
        else printf '%s\n' "$line"; fi ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$ROOT_ENV" > "$ROOT_TMP"

  [ -n "$root_pw" ] && [ "$found_pw" = 0 ] && printf 'BACKEND_POSTGRES_PASSWORD=%s\n' "$root_pw" >> "$ROOT_TMP"
  [ -n "$root_redis_pw" ] && [ "$found_redis_pw" = 0 ] && printf 'BACKEND_REDIS_PASSWORD=%s\n' "$root_redis_pw" >> "$ROOT_TMP"

  chmod 600 "$ROOT_TMP"
  mv "$ROOT_TMP" "$ROOT_ENV"
  trap - EXIT
  echo "Updated docker-compose var(s) in $ROOT_ENV"
fi

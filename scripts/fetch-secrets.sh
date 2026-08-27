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

while IFS=$'\t' read -r name value; do
  key="${name##*/}"
  printf '%s=%s\n' "$key" "$value" >> "$TMP"
done <<< "$PARAMS"

chmod 600 "$TMP"
mv "$TMP" "$OUT"
trap - EXIT
echo "Wrote $(wc -l < "$OUT" | tr -d ' ') lines to $OUT"

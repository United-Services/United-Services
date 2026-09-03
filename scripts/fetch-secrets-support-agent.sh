#!/usr/bin/env bash
# Run on the server (or at the start of a support-agent deploy) to
# materialize support-agent/backend/.env.support-agent from SSM. Safe to
# commit — contains no secret values, only the mechanism. Requires AWS
# credentials with ssm:GetParametersByPath + kms:Decrypt scoped to
# /united-services/support-agent/* — a narrower path than the main
# platform's own fetch-secrets.sh (/united-services/*), so this
# service's deploy role never needs read access to the platform's
# shared secrets (AWS keys, Clerk secrets, GeoIP license, etc.) at all.
#
# See scripts/fetch-secrets.sh for the sibling script this mirrors —
# same atomic-write pattern, same reasoning, deliberately kept as two
# separate scripts (not one parameterized by prefix) so a future edit to
# the platform's fetch path can't accidentally widen support-agent's.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENVIRONMENT="${ENVIRONMENT:-staging}"
OUT="$REPO_ROOT/support-agent/backend/.env.support-agent"

if [ -z "${AWS_ACCESS_KEY_ID:-}" ] && [ -f "$OUT" ]; then
  AWS_ENV_LINES="$(grep -E '^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|REGION)=' "$OUT" || true)"
  while IFS='=' read -r key value; do
    [ -n "$key" ] && export "$key=$value"
  done <<< "$AWS_ENV_LINES"
fi

TMP="$(mktemp "$REPO_ROOT/support-agent/backend/.env.support-agent.fetch-secrets.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

echo "Fetching secrets from /united-services/support-agent/${ENVIRONMENT}/ ..."
PARAMS="$(aws ssm get-parameters-by-path \
  --path "/united-services/support-agent/${ENVIRONMENT}/" \
  --with-decryption \
  --query "Parameters[*].[Name,Value]" \
  --output text)"

if [ -z "$PARAMS" ]; then
  echo "ERROR: no parameters found under /united-services/support-agent/${ENVIRONMENT}/ — leaving $OUT untouched." >&2
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

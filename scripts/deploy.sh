#!/usr/bin/env bash
# Deploy entrypoint for the server — pulls current secrets from SSM before
# every deploy (not just once), then rebuilds/restarts the stack. See
# docs/DEPLOYMENT.md's "Secrets management" section.
#
# Usage: ENVIRONMENT=staging scripts/deploy.sh
#   ENVIRONMENT defaults to "staging" — set explicitly to "prod" for a
#   production deploy so a stray unqualified run never touches prod by
#   accident.
set -euo pipefail

# Resolve the repo root relative to this script's own location, so it works
# regardless of the caller's cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export ENVIRONMENT="${ENVIRONMENT:-staging}"

"$REPO_ROOT/scripts/fetch-secrets.sh"
cd "$REPO_ROOT"
docker compose pull
docker compose up -d --build --remove-orphans

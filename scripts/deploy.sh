#!/usr/bin/env bash
# Deploy entrypoint for the server — pulls current secrets from SSM before
# every deploy (not just once), then pulls the current prebuilt
# backend/frontend images from GHCR and restarts the stack on them. See
# docs/DEPLOYMENT.md's "Secrets management" and "Deploying an update"
# sections.
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
# No --build: backend/frontend are prebuilt images from GHCR now (see
# .github/workflows/docker-publish.yml and docs/DEPLOYMENT.md) — rebuilding
# here would silently throw away the image `pull` just fetched and replace
# it with a local build, defeating the entire point of a server that needs
# no source checkout or npm/tsc toolchain. Local dev still uses `docker
# compose up -d --build` directly (not this script).
docker compose up -d --remove-orphans

# Keeps nginx/cloudflare-ips.d/*.conf current on every deploy, not just the
# daily cron/systemd timer (see that script's own comment) — a fresh
# checkout has no generated file at all until this runs once, which would
# otherwise leave real_ip with nothing to resolve against until the next
# scheduled run.
"$REPO_ROOT/scripts/update-cloudflare-ips.sh"

# Every rebuild/re-pull that replaces a tag (:latest) leaves the previous
# image behind as a now-nameless "<none>" layer — harmless individually,
# but they silently accumulate across repeated deploys/local rebuilds (15GB+
# of them piled up during one afternoon of iterating on this exact
# pipeline). `-f`: no interactive confirmation, safe here since this only
# ever touches images with no name/tag left pointing at them — never one a
# running container still references.
docker image prune -f

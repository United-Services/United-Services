#!/usr/bin/env bash
# Fetches Cloudflare's current published IP ranges
# (https://www.cloudflare.com/ips-v4 / ips-v6) and rewrites the managed
# block in nginx/nginx.conf between the "# BEGIN cloudflare-ips" /
# "# END cloudflare-ips" markers — see that file's comment for why this
# exists (real_ip resolution once Cloudflare fronts the server) and
# docs/BUSINESS_RULES.md rule 13 for what breaks silently without it.
#
# Meant to run daily via cron/systemd timer (see docs/DEPLOYMENT.md) —
# Cloudflare rotates these ranges occasionally and there's no
# webhook/push for it, so periodic polling is the only way to catch a
# change. Safe to run as often as you like: it's a no-op whenever the
# fetched list matches what's already in nginx.conf, and only
# tests+reloads nginx when something actually changed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$REPO_ROOT/nginx/nginx.conf"
BEGIN_MARKER="  # BEGIN cloudflare-ips — managed by scripts/update-cloudflare-ips.sh, do not edit by hand"
END_MARKER="  # END cloudflare-ips"

if ! grep -qF "$BEGIN_MARKER" "$CONF"; then
  echo "ERROR: $CONF is missing the cloudflare-ips marker block — nothing to update." >&2
  exit 1
fi

IPV4="$(curl -fsS --max-time 10 https://www.cloudflare.com/ips-v4)"
IPV6="$(curl -fsS --max-time 10 https://www.cloudflare.com/ips-v6)"

# Sanity-check the response shape before trusting it: Cloudflare's
# endpoint returning an HTML error page, a rate-limit response, or an
# empty body must never silently wipe out the trusted-IP list — that
# would either break real_ip resolution (empty) or, worse, get written
# into nginx.conf as garbage that fails `nginx -t`. Require every
# non-empty line to look like an IPv4 or IPv6 CIDR range, and require at
# least a handful of ranges back (Cloudflare publishes ~15 v4 + ~7 v6;
# anything drastically smaller than that is itself a sign of a bad
# response, not a real change).
CIDR_RE='^[0-9a-fA-F:.]+/[0-9]{1,3}$'
validate_cidr_list() {
  local list="$1" label="$2" min_lines="$3"
  local count=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    if ! [[ "$line" =~ $CIDR_RE ]]; then
      echo "ERROR: unexpected line in Cloudflare's $label response: '$line' — leaving nginx.conf untouched." >&2
      exit 1
    fi
    count=$((count + 1))
  done <<< "$list"
  if [ "$count" -lt "$min_lines" ]; then
    echo "ERROR: only got $count $label range(s) back (expected at least $min_lines) — leaving nginx.conf untouched." >&2
    exit 1
  fi
}
validate_cidr_list "$IPV4" "ips-v4" 10
validate_cidr_list "$IPV6" "ips-v6" 3

BLOCK="$(mktemp)"
NEW_CONF="$(mktemp "$REPO_ROOT/nginx/.nginx.conf.XXXXXX")"
trap 'rm -f "$BLOCK" "$NEW_CONF"' EXIT

{
  echo "$BEGIN_MARKER"
  while IFS= read -r ip; do
    [ -n "$ip" ] && printf '  set_real_ip_from %s;\n' "$ip"
  done <<< "$IPV4"
  while IFS= read -r ip; do
    [ -n "$ip" ] && printf '  set_real_ip_from %s;\n' "$ip"
  done <<< "$IPV6"
  echo "$END_MARKER"
} > "$BLOCK"

awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" -v blockfile="$BLOCK" '
  $0 == begin {
    in_block = 1
    while ((getline line < blockfile) > 0) print line
    close(blockfile)
    next
  }
  $0 == end { in_block = 0; next }
  in_block { next }
  { print }
' "$CONF" > "$NEW_CONF"

if diff -q "$CONF" "$NEW_CONF" > /dev/null 2>&1; then
  echo "Cloudflare IP ranges unchanged — nothing to do."
  exit 0
fi

mv "$NEW_CONF" "$CONF"
trap 'rm -f "$BLOCK"' EXIT
echo "Updated $CONF: $(echo "$IPV4" | grep -c .) IPv4 + $(echo "$IPV6" | grep -c .) IPv6 Cloudflare ranges."

# Validate + reload — best-effort. nginx normally runs in the `nginx`
# docker-compose service with this file bind-mounted read-only, but this
# script may also run somewhere without docker access (a bare host, CI) —
# degrade to a warning rather than fail the whole update if reload can't
# be confirmed; the file on disk is still correct either way.
if command -v docker >/dev/null 2>&1 && (cd "$REPO_ROOT" && docker compose ps nginx) >/dev/null 2>&1; then
  if (cd "$REPO_ROOT" && docker compose exec -T nginx nginx -t) 2>&1; then
    (cd "$REPO_ROOT" && docker compose exec -T nginx nginx -s reload)
    echo "nginx config validated and reloaded."
  else
    echo "ERROR: nginx -t failed against the new config — nginx.conf was updated on disk but NOT reloaded. Fix before anything else restarts nginx and picks up a bad config." >&2
    exit 1
  fi
else
  echo "NOTE: docker/compose not reachable here — nginx.conf was updated on disk but not reloaded. Run 'docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload' wherever nginx is actually running."
fi

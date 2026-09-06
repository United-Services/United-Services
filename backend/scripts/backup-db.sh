#!/usr/bin/env bash
# Database backup: pg_dump custom format, encrypted, shipped to S3.
#
# Replaces the DMMF-walking JSON snapshot (backup-db.ts) as the backup
# of record. That script was competently written but operationally
# inert: nothing scheduled it (its "7 days of 6-hourly backups"
# retention described a cadence no cron implemented), it wrote to a
# container-local directory with no volume, it was unencrypted, it read
# through the transaction pooler, and — decisively — there was no
# restore counterpart: its JSON is not pg_restore-consumable, so a
# restore meant writing new code under incident pressure.
#
# Runs on the HOST, not in the backend container (the node:22-slim
# image has no pg_dump; see backend/Dockerfile). Cron it there:
#   0 */6 * * *  cd /opt/united-services && ./backend/scripts/backup-db.sh >> /var/log/use-backup.log 2>&1
#
# Restore:
#   age -d -i "$BACKUP_AGE_IDENTITY" backup.dump.age > backup.dump
#   pg_restore -j 4 --clean --if-exists -d "$DIRECT_URL" backup.dump
#
# Requires: pg_dump, age (https://age-encryption.org), aws CLI.
# Env (from backend/.env or the host environment):
#   DIRECT_URL          session-mode connection string (:5432) — NEVER the
#                       :6543 transaction pooler; pg_dump needs a real
#                       session
#   BACKUP_AGE_RECIPIENT  age public key (age1...) — the private identity
#                       stays offline / in SSM, never on this host
#   BACKUP_S3_BUCKET    destination bucket (object-lock + a lifecycle
#                       rule expiring after 30 days recommended)
#   BACKUP_DIR          local staging dir (default: ./backups)
set -euo pipefail

: "${DIRECT_URL:?DIRECT_URL is required (session-mode :5432 connection string)}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required (age public key) — unencrypted backups are not written}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

case "$DIRECT_URL" in
  *:6543*) echo "ERROR: DIRECT_URL points at the :6543 transaction pooler; pg_dump needs the :5432 session endpoint." >&2; exit 1 ;;
esac

for bin in pg_dump age aws; do
  command -v "$bin" >/dev/null || { echo "ERROR: $bin not found on PATH" >&2; exit 1; }
done

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$BACKUP_DIR/use-$stamp.dump"
enc="$dump.age"

echo "[backup] $stamp: pg_dump -Fc ..."
# --no-owner/--no-privileges so the dump restores under whatever role
# the target uses (Supabase and the local image use different owners).
pg_dump "$DIRECT_URL" -Fc --no-owner --no-privileges -f "$dump"

echo "[backup] encrypting ..."
age -r "$BACKUP_AGE_RECIPIENT" -o "$enc" "$dump"
shred -u "$dump" 2>/dev/null || rm -f "$dump"

echo "[backup] uploading to s3://$BACKUP_S3_BUCKET/db/ ..."
aws s3 cp "$enc" "s3://$BACKUP_S3_BUCKET/db/$(basename "$enc")" --storage-class STANDARD_IA --only-show-errors

# Keep the last 7 days locally as a fast path; S3 is the durable copy.
find "$BACKUP_DIR" -name 'use-*.dump.age' -mtime +7 -delete

size="$(du -h "$enc" | cut -f1)"
echo "[backup] done: $(basename "$enc") ($size)"

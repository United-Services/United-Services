# United Services — Disaster Recovery Runbook

## Scope

Two independent data stores, recovered separately but coordinated as one
plan: the Supabase Postgres database (all application data) and the S3
bucket `united-services` (spec files, candidate ID photos/CVs).

## Automatic Postgres + Redis failover (live standby)

Beyond the backup/restore plan below, the backend maintains an always-on
local standby (`postgres`/`redis` in `docker-compose.yml`) and fails over
to it **automatically**, with no restart or human action, if Supabase or
Upstash becomes unreachable — see `backend/src/failover/`.

- **Detection**: `FailoverService` pings each primary every 5s; 3
  consecutive failures flip that store's mode to `local`, 3 consecutive
  successes while in `local` flip it back. Postgres and Redis fail over
  independently. Current mode for both is reported on `GET /health`
  (`failover.postgres`/`failover.redis`), which Betterstack already
  polls.
- **Routing**: `PrismaService`/`RedisService` are Proxies over two real
  connections each — every existing `this.prisma.*`/`this.redis.*` call
  site in the app is unchanged; the Proxy transparently routes to
  whichever connection is currently active. BullMQ's own Queue/Worker
  connections (translations, audit-log archival, and the two failover
  workers below) do the same via `createFailoverRedisConnection`.
- **Keeping the standby current**: `DbMirrorSyncWorker` runs every 10
  minutes (only while Postgres is in `primary` mode): applies
  `prisma migrate deploy` against the local standby (creates every table
  and index from the same migration history used for primary — no second
  migration system), then batch-upserts every row from every model and
  removes any local row no longer present on primary. Batched (500 rows)
  and paced (250ms between batches) specifically so this can never become
  an unthrottled dump against Supabase.
- **Writes during a Postgres failover — the accepted tradeoff**: writes
  made against the local standby while Postgres is in fallback mode are
  accepted (not rejected), and logged to `FailoverWriteLog` (an outbox
  table). Once Postgres recovers, `FailoverReconciliationWorker` replays
  every logged write against primary, in order. This is **not**
  conflict-free by construction — two different writes to the *same*
  resource on both sides of a partition can't both "win." For every
  model except `Appointment`/`AppointmentSlot` (the one place with a
  same-target uniqueness invariant — `docs/BUSINESS_RULES.md` rule 4),
  replay is a plain last-write-wins upsert. For those two, a replay that
  doesn't apply as originally intended (e.g. a slot booked locally during
  the outage that a *different* booking already claimed on primary) is
  **not** silently overwritten — it's recorded in `FailoverConflict` for
  manual review instead. Query `FailoverConflict` on primary directly to
  find these; `resolvedAt` is never set automatically.
- **Redis failover** carries materially less risk than Postgres: what it
  holds (MFA session-verification flags, rate-limit counters, translation
  locks, BullMQ queue state) is ephemeral by nature. A Redis failover's
  worst case is an admin re-verifying MFA once or a rate limit resetting
  — not lost business data. In-flight BullMQ jobs on the connection at
  the moment of failover are lost, not replayed; every job in this
  codebase is already designed to be safely re-triggered (see the
  DLQ/retry pattern each worker uses).

## Backups

### Database (Supabase Postgres)
- **Our own backups — `backend/scripts/backup-db.sh`** (the backup of
  record; independent of the hosting provider). `pg_dump -Fc` over
  `DIRECT_URL`, encrypted with `age` to a public key whose private
  identity is kept off the host, uploaded to `BACKUP_S3_BUCKET`. Run
  from a host cron every 6 hours:
  `0 */6 * * *  cd /opt/united-services && ./backend/scripts/backup-db.sh`.
  (`pg_dump` is not in the backend image; this runs on the host.)
  The earlier `backup-db.ts` JSON snapshot is superseded: it was never
  scheduled, wrote inside the container, was unencrypted, and had no
  restore path — its output is not `pg_restore`-consumable.
- **Restore**:
  `age -d -i <identity> use-<stamp>.dump.age > use.dump` then
  `pg_restore -j 4 --clean --if-exists -d "$DIRECT_URL" use.dump`.
  Measured on a 609 MB / 2.9M-row copy: dump 4.5 s, restore 12.1 s.
  KEK private keys are **not** in this dump — see "KEK private keys".
- **Supabase's own**: automated daily backups on paid plans (PITR on Pro
  and above). Confirm the project's tier includes PITR before relying on
  sub-24h RPO from that side — the free tier only has periodic snapshots.
  Retention 7 days on Pro, up to 35 on higher tiers.
- **Verification**: quarterly, restore the latest `backup-db.sh` dump
  into a scratch database and run `prisma migrate status` plus a row-
  count spot-check (`User`, `Service`, `CandidateApplication`) against
  production.

### S3 (`united-services` bucket)
- **Current state**: versioning has been enabled on this bucket (per the
  project maintainer, 2026-08-13). Not independently re-verified via the
  AWS API from this session — the app's own IAM user (`Service-Account`)
  is deliberately scoped to object-level S3 permissions only and gets
  `AccessDenied` on `s3:GetBucketVersioning`, which is the correct
  least-privilege behavior, not a bug to fix.
- **Still open**: add a lifecycle rule to expire noncurrent versions after
  90 days to bound storage cost, and cross-region replication is not
  enabled.
- Objects are never deleted by the application (no `DeleteObject` call
  exists in the codebase), so the primary S3 risk is bucket-level
  misconfiguration or IAM error, not routine data loss.

## RTO / RPO targets

| Component | RPO (max data loss) | RTO (max time to restore) |
|---|---|---|
| Database | 6h (`backup-db.sh` cron) — sub-1h once Supabase PITR is confirmed | 1h (restore measured in seconds at current volume; the rest is the deploy chain) |
| S3 objects | 0 (versioning enabled — every object version is retained) | 1h |
| KEK private keys | 0 once `KEK_SSM_BACKUP_ENABLED=true` (mirrored to SSM at generation) | minutes — restored automatically on the next key-store reload |
| Application (Next.js + NestJS) | N/A — code is redeployed from git; the KEK row above is the one piece of state | 30m (redeploy from last known-good commit) |

These are starting targets, not yet load-tested or drilled — revisit after
the first practice restore.

## Who executes a restore

Whoever holds Supabase project-owner and AWS IAM admin access at the time
(currently the project's sole maintainer). Document names/contacts here
once the team grows beyond one person — a single-person bus factor is
itself a risk worth flagging.

## Restore procedure

### Database
1. In the Supabase dashboard, go to Database → Backups → select the
   target restore point → Restore. Supabase performs this in-place; there
   is no separate "spin up a new project" step for PITR restores.
2. If restoring into a fresh project instead (e.g. the original project is
   unrecoverable), update `DATABASE_URL` / `DIRECT_URL` in the backend's
   environment, then run `npx prisma migrate deploy` to ensure the schema
   matches the current migration history before serving traffic.
3. Spot-check: `SELECT count(*) FROM "User"`, `"Service"`,
   `"CandidateApplication"` and compare against the last known figures
   before declaring the restore complete.

### S3
1. Once versioning is enabled, restoring an accidentally deleted/
   overwritten object is: list versions for the key
   (`aws s3api list-object-versions --bucket united-services --prefix
   <key>`), then copy the desired version back over the current one.
2. Full-bucket loss (region-level AWS incident): re-provision the bucket
   from the last cross-region replication target — **cross-region
   replication is not yet configured**; this is the same gap as
   versioning above and should be set up together.

### Application
Redeploy the last known-good commit from `main`. No data migration needed
unless the incident coincided with a database restore to an earlier
point, in which case redeploy the commit that matches that schema version
(check `prisma/migrations/` history against the restore point's
timestamp).

The application is **not** stateless — see the next section.

### KEK private keys

Admin TOTP secrets are envelope-encrypted: each secret is sealed under a
KEK whose **private key exists only as a file** in the `kek-keys` Docker
volume (`KEK_KEYS_DIR`). The database holds the public halves and the
ciphertext; a database backup is useless for MFA without the private key
files. Losing them makes every `TotpCredential` permanently undecryptable
— every admin loses TOTP, and has to re-enroll after an operator resets
their MFA.

**Backup.** With `KEK_SSM_BACKUP_ENABLED=true` (required in production),
every private key is also written to SSM Parameter Store as a
`SecureString` at `/united-services/<ENVIRONMENT>/kek/<keyId>` the moment
it is generated — by the rotation worker and by `npm run kek:generate`
alike (`src/crypto/kek-ssm-backup.service.ts`). This is the same
namespace and the same AWS credentials `scripts/fetch-secrets.sh` already
uses.

**Restore.** Automatic. On boot and on any key-store reload, a registry
row whose key file is missing locally is fetched from SSM and written
back at `0400` (`KekKeyStore.reload()`). So a fresh volume or a new host
recovers on its own, and a missing file **no longer prevents the API
from starting** — that one key is unavailable and logged at `error`
until restored, but every other route serves.

**Rotation.** Automatic, daily at 03:30 (`KekRotationWorker`): a new key
is generated once the active one is older than `KEK_ROTATION_MAX_AGE_DAYS`
(default 90), every credential is force-re-wrapped off the retiring key,
and the retiring key is retired and its file shredded once nothing
references it. Each step is audit-logged (`kek.rotated`,
`mfa.totp_rewrapped`, `kek.retired`) and logged at `warn` for Betterstack.

**Manual override.** `npm run kek:generate` rotates immediately;
`npm run kek:retire -- --keyId=<id>` retires a specific key. Both refuse
unsafe states (retiring the active key; retiring a key still referenced).

**If SSM backup was never enabled and the volume is lost:** there is no
recovery. Reset MFA for every admin (`mfaEnrolled = false`, delete their
`TotpCredential` and `WebAuthnCredential` rows) and have them re-enroll.
This is the scenario the backup exists to prevent.

## Planned database cutover (Supabase ↔ local Postgres)

This is distinct from the automatic failover above. A planned move in
either direction is a deliberate switch of `DATABASE_URL`/`DIRECT_URL`
and a restart — nothing in `FailoverService` fires, so `FailoverWriteLog`
captures nothing, and without the maintenance mode below every write
during the switch either lands on the database being abandoned (lost)
or fails.

**Target: under five minutes of write-unavailability, zero read
unavailability, zero lost writes.** At the current data volume the copy
itself is seconds (measured on a 609 MB / 2.9M-row copy: `pg_dump -Fc`
4.5 s, `pg_restore -j 4` 12.1 s); the restart chain in
`docker-entrypoint.sh` (secrets → migrate → KEK probe → geoipupdate)
dominates. Above roughly 5–10 GB a dump/restore no longer fits the
window and logical replication is needed instead.

The schema is 100% vanilla Postgres — no RLS, no extensions, nothing in
Supabase-managed schemas — so `pg_dump`/`pg_restore` moves it cleanly in
either direction.

1. **Rehearse first** against a scratch copy and record real timings;
   replace the estimates here with them.
2. **Enable write-maintenance**: `redis-cli SET maintenance:writes-disabled 1`.
   `MaintenanceGuard` (first in the guard chain) now answers every
   mutating request with `503` + `Retry-After: 120` and a message the
   frontend shows as a banner; reads keep serving from the old database.
3. Wait ~2 s for in-flight writes to drain.
4. `pg_dump -Fc "$DIRECT_URL" -f cutover.dump` — over **`DIRECT_URL`**
   (`:5432`, session mode), never the `:6543` transaction pooler.
5. Restore into the target: `pg_restore -j 4 --clean --if-exists -d "<target DIRECT_URL>" cutover.dump`.
   For local → Supabase the target's `public` schema must be empty first
   and the restore runs as the project's owning role.
6. Verify: row counts for `User`, `Service`, `CandidateApplication`
   against the source, and `npx prisma migrate status` against the
   target.
7. Swap `DATABASE_URL`/`DIRECT_URL` (SSM, or `.env`) and restart the
   backend. Watch the entrypoint complete.
8. `GET /api/v1/health` — it round-trips a real query.
9. **Disable maintenance**: `redis-cli DEL maintenance:writes-disabled`.

Rollback at any step before 7 is simply step 9 — nothing has moved.
After 7, swap the URLs back and restart; the old database is untouched
because no write reached either side while the flag was set.

## Alerting

Betterstack is wired for uptime monitoring (`GET /api/v1/health`, which
itself round-trips a real DB query) and receives shipped application logs
(`error`/`warn`/`info`) from the NestJS backend — see
`src/logging/betterstack.logger.ts`. A dashboard and alert thresholds have
been configured in Betterstack (per the project maintainer, 2026-08-13) —
not independently re-verified from this session since that's a
Betterstack-console-only action with no API credential available here.

## Outstanding gaps (tracked here, not hidden)

- S3 lifecycle rule to expire noncurrent versions: not configured.
- Cross-region S3 replication: not configured.
- Confirmed Supabase PITR tier: not verified.
- Practice restore: never performed — targets above are estimates, not
  drilled numbers.

## Setup instructions for the two S3 gaps above

The app's own IAM user (`Service-Account`) is deliberately scoped to
object-level S3 permissions only (`AccessDenied` confirmed live on both
`s3:GetBucketVersioning` and `s3:GetLifecycleConfiguration` — this is
correct least-privilege, not a bug). Both of these need to be applied via
the AWS Console or CloudShell with a broader (account-admin or
bucket-owner) credential — not something the app's own deployment
pipeline should ever be able to do.

### Lifecycle rule — expire noncurrent versions after 90 days

Bounds storage cost from versioning (every overwrite/delete keeps the old
version indefinitely otherwise). Apply via AWS CLI:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket united-services \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-noncurrent-versions",
        "Status": "Enabled",
        "Filter": {},
        "NoncurrentVersionExpiration": { "NoncurrentDays": 90 }
      }
    ]
  }'
```

Or in the Console: S3 → `united-services` → Management → Lifecycle rules
→ Create rule → scope to "Apply to all objects in the bucket" → check
only "Permanently delete noncurrent versions of objects" → 90 days.

### Cross-region replication (CRR)

Protects against a region-level AWS incident. This is more involved than
the lifecycle rule — needs a destination bucket in a second region, an
IAM role granting the source bucket permission to replicate into it, and
a replication configuration tying them together. Steps:

1. Create a destination bucket in a different region (e.g.
   `united-services-dr` in `us-west-2` if the primary is `us-east-1`),
   with versioning enabled (CRR requires versioning on both sides — the
   source already has it).
2. Create an IAM role for replication (AWS provides a wizard for this
   when you set up CRR through the Console — S3 → `united-services` →
   Management → Replication rules → Create replication rule — it offers
   to create the IAM role automatically with the correct trust policy and
   permissions).
3. Replication rule: source = entire bucket (or prefix-scoped if only
   spec files/candidate documents need DR coverage, not everything),
   destination = the bucket from step 1, replicate existing objects
   (S3 Batch Replication, a one-time backfill — new objects replicate
   automatically going forward regardless).
4. Once live, update this doc's "Full-bucket loss" restore step with the
   destination bucket name and the procedure to re-point `S3_BUCKET_NAME`
   at it (or restore by copying objects back to a newly created bucket
   with the original name, to avoid an env-var/DNS change during an
   actual incident).

### Confirming Supabase PITR tier

Supabase dashboard → Project Settings → Billing → confirms the current
plan. Database → Backups shows whether continuous backups (PITR) are
listed as available for this project specifically, versus only daily
snapshots. No API credential was available in this session to check this
programmatically — needs a one-time manual confirmation.

### Practice restore

Deliberately not performed from this session — restoring into a scratch
Supabase project and diffing row counts is safe to automate, but actually
exercising the *production* restore path (or even the scratch-project
path) is a real action against real infrastructure that should be a
deliberate, scheduled exercise with the maintainer present, not something
run opportunistically mid-session. Recommend scheduling this once the
lifecycle rule and CRR above are in place, so the drill exercises the
complete, final setup rather than a partial one.

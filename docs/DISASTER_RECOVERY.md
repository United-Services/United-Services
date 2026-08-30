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
- **Schedule**: Supabase takes automated daily backups on paid plans
  (point-in-time recovery on the Pro tier and above). Confirm the project's
  plan tier includes PITR before relying on sub-24h RPO — the free tier
  only has periodic snapshots, not continuous WAL archiving.
- **Retention**: 7 days on Pro, up to 35 days on higher tiers (Supabase
  dashboard → Database → Backups shows the exact window for this project).
- **Verification**: quarterly, restore the latest backup into a scratch
  Supabase project and run `prisma migrate status` against it to confirm
  the schema and a spot-check of row counts match production.

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
| Database | 24h (daily backup) — sub-1h achievable once PITR is confirmed enabled | 2h |
| S3 objects | 0 (versioning enabled — every object version is retained) | 1h |
| Application (Next.js + NestJS) | N/A — stateless, redeployed from git | 30m (redeploy from last known-good commit) |

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
Stateless — redeploy the last known-good commit from `main`. No data
migration needed unless the incident coincided with a database restore to
an earlier point, in which case redeploy the commit that matches that
schema version (check `prisma/migrations/` history against the restore
point's timestamp).

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

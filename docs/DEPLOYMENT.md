# United Services — Deployment & Infrastructure Notes

Phase 15 of the original kickoff plan. This session ran entirely against
real cloud services in local dev (Supabase, S3, Upstash Redis, Clerk,
Betterstack — see `docs/CREDENTIALS_CHECKLIST.md`) but never actually
deployed either app anywhere. This is the runbook for doing that, plus the
architecture decisions it assumes.

## Architecture

```
                         ┌─────────────────────┐
  visitor ──────────────▶│  Cloudflare (DNS +   │
                         │  WAF/CDN in front)   │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
          ┌──────────────────┐            ┌──────────────────────┐
          │  Next.js frontend │  same-site │  NestJS backend API  │
          │  (App Router,     │◀──cookies──│  /api/v1/*            │
          │  server-rendered) │            │                       │
          └──────────────────┘            └───────────┬───────────┘
                                                        │
                        ┌───────────────┬───────────────┼───────────────┬────────────────┐
                        ▼               ▼               ▼               ▼                ▼
                 Supabase Postgres  Upstash Redis   AWS S3 bucket   Clerk (auth)   Betterstack (logs)
```

Both apps are stateless (all state lives in Postgres/Redis/S3), so either
one can be redeployed from a known-good git commit with no data migration
step beyond `prisma migrate deploy`.

## Why same-site cookies matter

`backend/src/lib/api.ts`'s `withCredentials: true` and Clerk's session
cookie only work across frontend↔backend calls without extra CORS/cookie
gymnastics if both are served from the **same registrable domain** (e.g.
`use-eg.com` for the frontend, `api.use-eg.com` for the backend — both
under `use-eg.com`, not two unrelated domains). Pick subdomains under one
domain before provisioning anything else; retrofitting this later means
touching `CORS_ORIGINS`, Clerk's allowed origins, and cookie `domain`
settings all at once.

## Running the full stack locally with Docker

An alternative to running `backend`/`frontend` as two separate `npm run
dev` processes (see `backend/AGENTS.md` / `frontend/AGENTS.md`) — brings
up the whole stack, including nginx routing, in one command:

```bash
# Create .env at the repo root — see docs/CREDENTIALS_CHECKLIST.md's
# ".env.example shape" section for what each var means
docker compose up --build

# Every rebuild that replaces backend/frontend:latest leaves the previous
# image behind as a nameless "<none>" layer — harmless individually, but
# they pile up fast across repeated --build runs (15GB+ in one afternoon
# of iterating). Get in the habit of running this after each one:
docker image prune -f
```

This starts `postgres`, `redis`, `backend`, `frontend`, and `nginx` (port
80 by default, `$NGINX_PORT`). This is local-only — a real deploy doesn't
use `--build` at all; see "Deploying an update" below.

## Hosting options

Two viable paths — pick one, don't half-do both:

### Option A — Physical/dedicated server behind Cloudflare (original plan)

What `docs/CREDENTIALS_CHECKLIST.md` section 6 assumes ("DNS records
pointed at the physical server", Cloudflare added "later" for WAF/CDN).

**This is now implemented, not just planned** — `docker-compose.yml` at the
repo root, `backend/Dockerfile`, `frontend/Dockerfile`, and
`nginx/nginx.conf`. Verified end-to-end locally (real containers, real
Postgres+Redis, real migrations + KEK bootstrap, real nginx routing both
`/api/*` and the frontend on one port).

1. Provision a server (any VPS/dedicated box with Docker installed) — no
   repo checkout, npm, or TypeScript toolchain needed on it. Only 3 files:
   `docker-compose.yml`, `nginx/nginx.conf`, and a `.env` you create there
   (see step 2).
2. Create `.env` next to `docker-compose.yml` with real values (Clerk,
   AWS, etc. — see `docs/CREDENTIALS_CHECKLIST.md`'s "`.env.example`
   shape" section), then authenticate to GHCR once (images are private,
   matching the repo) and pull:
   ```bash
   echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin
   docker compose pull
   docker compose up -d
   ```
   `backend`/`frontend` both pull prebuilt images from
   `ghcr.io/alioskillers/united-services-{backend,frontend}:latest` —
   `.github/workflows/docker-publish.yml` builds and pushes those on every
   merge to `main`. This gives you:
   - `postgres` + `redis` containers (or point `DATABASE_URL`/`REDIS_URL`
     at managed services instead and ignore these two — see the comment
     at the top of `docker-compose.yml`)
   - `backend`: entrypoint (`backend/docker-entrypoint.sh`) runs `prisma
     migrate deploy` then idempotently bootstraps the first TOTP KEK on a
     fresh DB before starting the app. KEK private keys persist in the
     `kek-keys` named volume — never on the container's ephemeral layer.
   - `frontend`: prebuilt Next.js image — every `NEXT_PUBLIC_*` var was
     already fetched from SSM and inlined at image-build time in CI (see
     `frontend/Dockerfile`'s build-stage comment), not at container start.
   - `nginx`: routes `/api/*` to the backend, everything else to the
     frontend, both on port 80 (see cookie note above — same origin).

   **Deploying an update** later: `docker compose pull && docker compose
   up -d` — that's the entire redeploy, no source checkout involved. Local
   development still uses `docker compose up -d --build` (both
   Dockerfiles keep their multi-stage build path for this) since a dev
   machine wants to build from its own working tree, not whatever's
   currently on `main`.
3. Point DNS at the server, then add the domain as a Cloudflare zone in
   front of it (orange-cloud proxy mode) for WAF/CDN/DDoS protection —
   this is the deferred step `docs/REQUIREMENTS.md` flags as not done.
   **Required as part of this step, not optional/later**: nginx's
   `real_ip` module — `real_ip_header CF-Connecting-IP;` plus a
   `set_real_ip_from` line per Cloudflare IP range — is already wired up
   in `nginx/nginx.conf`, kept current by `scripts/update-cloudflare-ips.sh`
   (see that script's own comment for the mechanics; run it once by hand
   now to confirm it applies cleanly, then put it on a daily
   cron/systemd timer on whichever host runs `docker compose` — Cloudflare
   rotates these ranges occasionally and publishes no webhook for it, so
   daily polling is the only way to catch a change):
   ```cron
   # /etc/cron.d/update-cloudflare-ips — runs once a day; the script
   # itself is a no-op whenever the fetched list hasn't changed.
   0 4 * * * root cd /path/to/repo && ./scripts/update-cloudflare-ips.sh >> /var/log/update-cloudflare-ips.log 2>&1
   ```
   or, as a systemd timer instead of cron:
   ```ini
   # /etc/systemd/system/update-cloudflare-ips.service
   [Service]
   Type=oneshot
   WorkingDirectory=/path/to/repo
   ExecStart=/path/to/repo/scripts/update-cloudflare-ips.sh

   # /etc/systemd/system/update-cloudflare-ips.timer
   [Timer]
   OnCalendar=daily
   Persistent=true
   [Install]
   WantedBy=timers.target
   ```
   `backend/src/configure-app.ts` sets `trust proxy: 1`, meaning it
   trusts exactly one hop (nginx) to have already resolved the true
   visitor IP into `X-Forwarded-For`. Without the `real_ip` config above
   staying current, that assumption silently breaks the moment
   Cloudflare's ranges drift from what's in `nginx.conf`: nginx would
   forward Cloudflare's edge IP (or a spoofable client-supplied header)
   instead of the real visitor, and the per-IP rate limiter would
   collapse every visitor into the same bucket — no error, no crash, just
   a rate limiter that quietly stops doing its job. See
   `configure-app.ts`'s comment on `trust proxy` for the full reasoning.
4. Health check for the reverse proxy / uptime monitor to poll:
   `GET /api/v1/health` (already exists, does a real DB round-trip — see
   `backend/src/health/health.controller.ts`). Both Dockerfiles also
   define their own `HEALTHCHECK` for `docker ps`/orchestrator use.

### Option B — Managed PaaS (faster to stand up, worth considering)

If a physical server isn't already provisioned, a managed platform avoids
owning OS patching / process supervision:
- **Frontend**: Vercel (native Next.js App Router support, zero config
  beyond env vars) or the same host as the backend if you want one bill.
- **Backend**: Railway, Render, or Fly.io — all run a Dockerfile or
  buildpack-detected Node app, support the `npm run build && node
  dist/main.js` flow unchanged, and give you a stable `api.<domain>`
  hostname to add a CNAME for.
- Cloudflare still goes in front of both as DNS-only or proxied, same as
  Option A.

Either way, the app code itself doesn't change — no framework assumes a
particular host.

## Environment variables

Full list and where to get each value: `docs/CREDENTIALS_CHECKLIST.md`.
Deployment-specific ones to double check are set in the **production**
environment (not just local `.env`), since they differ from dev:

- `CORS_ORIGINS` — **one-time bootstrap only**, not the ongoing source of
  truth: the app seeds the `AllowedOrigin` DB table from this exactly
  once, the first time it starts against a genuinely empty table, then
  never reads it again (see `AllowedOriginsService`). Adding/removing an
  allowed origin afterward means adding/removing the row directly in the
  database — deliberately no admin-dashboard UI or API for this, CORS is
  security-sensitive enough to stay a DB-only change. Takes effect within
  ~30s, no restart needed.
- `NEXT_PUBLIC_API_URL` — the real backend origin, not `localhost:3002`
- `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_ORIGIN` — must match the real domain or
  admin biometric MFA silently fails (WebAuthn ties credentials to origin)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk's
  **production** instance keys, not the dev/test ones CI uses as
  placeholders
- `DATABASE_URL` / `DIRECT_URL` — Supabase's pooled vs. direct connection
  strings respectively (see `backend/prisma.config.ts` comment — migrations
  need `DIRECT_URL`, the running app needs the pooled `DATABASE_URL`)

## Adding/removing an allowed CORS origin

Direct database change, not an env var or a redeploy — see
`AllowedOriginsService`'s comment for why this stays DB-only rather than
an admin-dashboard feature. Takes effect within ~30s, no restart needed.

```sql
-- Add one:
INSERT INTO "AllowedOrigin" (id, origin) VALUES (gen_random_uuid()::text, 'https://new-subdomain.use-eg.com');
-- Remove one:
DELETE FROM "AllowedOrigin" WHERE origin = 'https://old-subdomain.use-eg.com';
```

`origin` must exactly match what a browser sends in its `Origin` header —
scheme + host + optional port, no path, no trailing slash.

## Secrets management (AWS SSM Parameter Store)

Real secrets (Clerk, Supabase/Postgres, Upstash, S3, Betterstack, webhook
signing, GeoIP/MaxMind license) live in AWS SSM Parameter Store, not in a
server-side `.env` maintained by hand. `CORS_ORIGINS` is pushed through
SSM too, but only ever consulted once, to bootstrap the `AllowedOrigin`
table on a genuinely fresh deploy — see the "Environment variables"
section above. `WEBAUTHN_RP_ID`/`ORIGIN` and other tuning constants stay
real env vars, read on every start same as always.

**Naming**: `/united-services/<environment>/<KEY>`, e.g.
`/united-services/staging/CLERK_SECRET_KEY` and
`/united-services/prod/CLERK_SECRET_KEY` — kept as fully separate SSM paths
(not just a suffix) so a `staging` push/fetch can never collide with or
overwrite `prod`.

**One-time (or per-rotation) push**, run locally with your own AWS
credentials (needs `ssm:PutParameter` on `/united-services/*`):

```bash
scripts/push-secrets.sh staging   # or: scripts/push-secrets.sh prod
```

**On the server, every deploy** (materializes `backend/.env` from SSM's
real secrets, then starts the stack):

```bash
ENVIRONMENT=staging scripts/deploy.sh   # or ENVIRONMENT=prod
```

**IAM policy** for whatever runs `fetch-secrets.sh`/`deploy.sh` on the
server — least privilege, scoped to exactly this app's path and nothing
broader:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameter", "ssm:GetParametersByPath"],
      "Resource": "arn:aws:ssm:*:*:parameter/united-services/*"
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:*:*:key/alias/aws/ssm"
    }
  ]
}
```

(If a custom KMS key is used instead of the AWS-managed `aws/ssm` key,
adjust the second `Resource` ARN — check `aws kms list-aliases` if unsure
which key SSM is actually using.)

**How the server authenticates to AWS at all** — depends on the hosting
decision in "Hosting options" above, not yet made as of this writing:

- **EC2** (if Option A's physical/VPS path ends up being an EC2 instance):
  attach an IAM instance profile with the policy above. No AWS access
  key/secret needs to exist anywhere on the server — the AWS CLI/SDK picks
  up credentials automatically from the instance metadata service. This
  also means `S3Service`'s static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
  could eventually be dropped entirely in favor of the same instance role,
  closing off one more long-lived secret — not done as part of this change,
  since it touches the S3 client construction itself.
- **Non-AWS VPS** (DigitalOcean, Hetzner, or any physical/dedicated box —
  what Option A actually describes today): there's no instance-role
  equivalent, so a dedicated IAM user scoped to exactly the policy above is
  needed, with its access key/secret provisioned onto the server once via
  `aws configure` over SSH — never through git, never through a committed
  `.env`. This is the one secret that can't bootstrap itself through this
  pipeline (chicken-and-egg): getting *this* credential onto the server is
  necessarily a manual, careful, one-time step.

**Rotating a secret**: generate the new value, `scripts/push-secrets.sh
<environment>` again (uses `--overwrite`), then on the server
`ENVIRONMENT=<environment> scripts/fetch-secrets.sh` followed by
`docker compose restart backend` — no full redeploy needed unless the
frontend also needs the new value (rare, since `NEXT_PUBLIC_*` vars are
never secrets and never go through SSM in the first place).

**Verifying without ever printing a secret value**:
```bash
aws ssm get-parameters-by-path --path "/united-services/staging/" --query "Parameters[*].Name"
```

## On-call alerting

`backend/src/alerting/` pages a real phone via [ntfy.sh](https://ntfy.sh)
the moment `AllExceptionsFilter` catches a genuine 5xx — not a log-based
alert rule (fragile, easy to silently break), a direct HTTP POST the
instant it happens. Free, no account — the destination is just a topic URL
whose random, unguessable name is what stands in for a secret (see
`docs/CREDENTIALS_CHECKLIST.md` §4b). Only fires for `statusCode >= 500`; a
400/403/404 is an expected, handled outcome and never pages anyone. A
15-minute per-route Redis cooldown means a burst of identical failures (a
real outage, a bug in a hot path) pages once, not once per request.

**Off everywhere except a real server that explicitly opts in** —
`ALERTING_ENABLED` defaults to unset/`false`, and without it being
explicitly `true`, `IncidentAlertService.trigger()` returns immediately
without ever calling `fetch`. Never set this to `true` in local dev or a
staging box that isn't meant to page you — every exception while actively
coding would otherwise ring your phone.

**Setup** (no dashboard/account needed — this is deliberately the free
alternative to a paid Betterstack On-Call escalation policy):
1. Pick a long, random, unguessable topic name — not a real word or
   anything guessable, since ntfy.sh topics have no authentication and
   the name itself is the only thing keeping a stranger from posting to
   (or subscribing to) it. `NTFY_TOPIC_URL` is `https://ntfy.sh/<that
   name>`.
2. Install the **ntfy** app (iOS/Android) and subscribe to that exact
   topic. Confirm push notifications are allowed for the app at the OS
   level — a correctly-sent notification can still get silently
   suppressed by the phone's own settings.
3. Send one manual test notification before wiring anything into the app,
   to confirm it actually reaches your phone (a typo'd topic name still
   returns 200 from ntfy without notifying anyone real):
   ```bash
   curl -H "Title: Test alert" -H "Priority: 5" -d "Verifying the pipeline works end to end" "$NTFY_TOPIC_URL"
   ```
4. Push the real topic URL through the SSM pipeline above like any other
   real secret (`scripts/push-secrets.sh`) — never commit it.

**Before trusting this in production**, verify with the real topic URL
(never in a committed `.env`):
- Force a real 500 (e.g. temporarily throw in a route) with
  `ALERTING_ENABLED=true` and confirm an actual push notification arrives
  — not just that the `fetch` call returns 200.
- Trigger the same failure 5 times in a row within 15 minutes and confirm
  exactly one notification arrives, not five.
- Confirm a 400/403/404 never pages, even though all of them also pass
  through `AllExceptionsFilter`.
- Set `ALERTING_ENABLED=false` again and confirm the same forced 500
  produces zero calls to ntfy.

## Release process

1. Merge to `main` — the CI gate (`.github/workflows/ci.yml`) runs
   typecheck, build, `npm audit --audit-level=high`, and both unit-test
   jobs, plus the `backend-integration` job against real disposable
   Postgres+Redis containers. This is enforced by GitHub branch protection
   on `main` (all three jobs — `Backend — typecheck & build`,
   `Backend — integration tests (real Postgres + Redis)`,
   `Frontend — typecheck & build` — required, admins included, force-push
   and deletion blocked, PR + 1 approval required), not just a convention:
   a red pipeline or a direct push cannot land. If a job is renamed or
   split in `ci.yml`, update the required-checks list in the branch
   protection rule to match — a required check naming a job that no
   longer exists silently stops protecting anything.
2. Deploy — **not currently automated**. Whatever host is chosen from the
   two options above, wire its own deploy trigger (Vercel/Railway/Render
   all auto-deploy on push to `main` once connected to the repo; a
   physical server needs a manual `git pull && npm run build && restart`
   or a small deploy script/webhook).
3. Run `npx prisma migrate deploy` against production before or as
   part of the backend deploy step whenever `backend/prisma/migrations/`
   has new migrations — never `migrate dev` against production.
4. Smoke-check `GET /api/v1/health` and the homepage after deploy.

## Rollback

Both apps are stateless and built fresh from a git commit — rolling back
means redeploying the previous known-good commit (revert the merge, or
redeploy the prior tag/SHA on whichever host). The one exception: if the
bad deploy included a destructive migration, rolling back the app code
does **not** undo the migration — check `backend/prisma/migrations/` for
what shipped and write a compensating migration rather than trying to
"undo" one that already ran against production data.

## Scaling notes

- The global rate limiter (100 req/min per IP, Redis-backed — see
  `app.module.ts`) is verified to actually engage under load: see
  `backend/loadtest/rate-limit-enforcement.js` and its README. If traffic
  legitimately needs a higher ceiling, raise the `limit` there — don't
  just remove the guard.
- Baseline latency measured locally against a warm Redis cache: p95 ≈ 3–6ms
  on `/health` and `/services` (see `backend/loadtest/README.md`). Re-run
  `k6 run loadtest/public-endpoints.js` against the real deployed instance
  once it exists to get a production-network baseline — local numbers
  don't account for real network latency.
- Both apps are horizontally scalable as-is (no in-process session state;
  everything shared lives in Postgres/Redis/S3) if a host needs more than
  one instance — just make sure Redis/S3/Postgres connection limits are
  sized for however many instances you run.

## Outstanding gaps (tracked here, not hidden)

- Neither app has actually been deployed anywhere yet — this document
  describes the plan, not a completed migration.
- No domain has been chosen/confirmed for the frontend+backend
  same-registrable-domain requirement above.
- No auto-deploy trigger exists on any host.
- Cloudflare zone not yet created (blocked on the domain decision).

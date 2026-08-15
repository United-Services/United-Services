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

1. Provision a server (any VPS/dedicated box with Docker installed).
2. Copy `.env.example` → `.env` at the repo root, fill in real values
   (Clerk, AWS, etc. — see `backend/.env.example` for what each means),
   then `docker compose up -d --build`. This gives you:
   - `postgres` + `redis` containers (or point `DATABASE_URL`/`REDIS_URL`
     at managed services instead and ignore these two — see the comment
     at the top of `docker-compose.yml`)
   - `backend`: builds via multi-stage Dockerfile, entrypoint
     (`backend/docker-entrypoint.sh`) runs `prisma migrate deploy` then
     idempotently bootstraps the first TOTP KEK on a fresh DB before
     starting the app. KEK private keys persist in the `kek-keys` named
     volume — never on the container's ephemeral layer.
   - `frontend`: Next.js `output: 'standalone'` build, minimal runtime
     image.
   - `nginx`: routes `/api/*` to the backend, everything else to the
     frontend, both on port 80 (see cookie note above — same origin).
3. Point DNS at the server, then add the domain as a Cloudflare zone in
   front of it (orange-cloud proxy mode) for WAF/CDN/DDoS protection —
   this is the deferred step `docs/REQUIREMENTS.md` flags as not done.
   **Required as part of this step, not optional/later**: add nginx's
   `real_ip` module to `nginx/nginx.conf` —
   `set_real_ip_from <Cloudflare's current IP ranges>;` (fetch the live
   list from https://www.cloudflare.com/ips-v4/ and /ips-v6/ at deploy
   time — don't hardcode a snapshot, Cloudflare rotates these) plus
   `real_ip_header CF-Connecting-IP;`. `backend/src/configure-app.ts`
   sets `trust proxy: 1`, meaning it trusts exactly one hop (nginx) to
   have already resolved the true visitor IP into `X-Forwarded-For`.
   Without this nginx-side config, that assumption silently breaks the
   moment Cloudflare goes in front: nginx would forward Cloudflare's edge
   IP (or a spoofable client-supplied header) instead of the real
   visitor, and the per-IP rate limiter would collapse every visitor into
   the same bucket — no error, no crash, just a rate limiter that quietly
   stops doing its job. See `configure-app.ts`'s comment on `trust proxy`
   for the full reasoning.
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
  buildpack-detected Node app, support the `pnpm run build && node
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

- `CORS_ORIGINS` — the real frontend origin(s), not `localhost:3000`
- `NEXT_PUBLIC_API_URL` — the real backend origin, not `localhost:3002`
- `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_ORIGIN` — must match the real domain or
  admin biometric MFA silently fails (WebAuthn ties credentials to origin)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk's
  **production** instance keys, not the dev/test ones CI uses as
  placeholders
- `DATABASE_URL` / `DIRECT_URL` — Supabase's pooled vs. direct connection
  strings respectively (see `backend/prisma.config.ts` comment — migrations
  need `DIRECT_URL`, the running app needs the pooled `DATABASE_URL`)

## Release process

1. Merge to `main` — the required CI gate (`.github/workflows/ci.yml`)
   runs typecheck, build, and both unit-test jobs, plus the
   `backend-integration` job against real disposable Postgres+Redis
   containers. This gate must pass before anything ships.
2. Deploy — **not currently automated**. Whatever host is chosen from the
   two options above, wire its own deploy trigger (Vercel/Railway/Render
   all auto-deploy on push to `main` once connected to the repo; a
   physical server needs a manual `git pull && pnpm run build && restart`
   or a small deploy script/webhook).
3. Run `pnpm exec prisma migrate deploy` against production before or as
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

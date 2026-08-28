# United Services Egypt

Corporate website, client/candidate portal, and admin dashboard for
**United Services Egypt** — pipeline integrity and corrosion-control
solutions for the oil & gas industry across Egypt, Iraq, Saudi Arabia, and
the UAE.

## Stack

| Layer     | Technology                                                                 |
| --------- | --------------------------------------------------------------------------- |
| Frontend  | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · next-intl (en/ar/zh) |
| Backend   | NestJS 11 · TypeScript · Prisma ORM 7 (`@prisma/adapter-pg`)               |
| Database  | PostgreSQL                                                                 |
| Cache     | Redis (caching + rate-limit storage)                                      |
| Auth      | Clerk (session auth + WebAuthn/TOTP admin MFA)                            |
| Storage   | AWS S3 (private bucket, presigned URLs only)                              |
| Logging   | Betterstack                                                                |
| Deploy    | Docker (multi-stage) · nginx reverse proxy · docker-compose               |

## Repository layout

```
backend/    NestJS API (src/, prisma/, test/)
frontend/   Next.js app (src/app, src/views, src/components, messages/)
nginx/      Reverse-proxy config (routes /api/* to backend, everything else to frontend)
docs/       Business rules, deployment runbook, disaster recovery, requirements
docker-compose.yml   postgres + redis + backend + frontend + nginx
```

See `backend/AGENTS.md` and `frontend/AGENTS.md` for the conventions each
app follows internally.

## Getting started (local development)

Prerequisites: Node 22+, npm, a PostgreSQL instance, a Redis instance, and
a Clerk application (dev instance keys are fine locally).

```bash
# Backend
cd backend
# Create .env with real values — see docs/CREDENTIALS_CHECKLIST.md's
# "`.env.example` shape" section for the full list (DATABASE_URL, Clerk
# keys, AWS S3, etc.)
npm install
npm run prisma:migrate
npm run seed                 # optional: seed fixture data
npm run start:dev            # http://localhost:3002/api/v1

# Frontend (separate terminal)
cd frontend
# Create .env.local with at least:
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
#   CLERK_SECRET_KEY=
#   NEXT_PUBLIC_API_URL=http://localhost:3002/api/v1
npm install
npm run dev                  # http://localhost:3000
```

## Running with Docker

```bash
# Create .env at the repo root — see docs/CREDENTIALS_CHECKLIST.md's
# "`.env.example` shape" section for what each var means
docker compose up --build

# Every rebuild that replaces backend/frontend:latest leaves the previous
# image behind as a nameless "<none>" layer — harmless individually, but
# they pile up fast across repeated `--build` runs (15GB+ in one afternoon
# of iterating). Get in the habit of running this after each one:
docker image prune -f
```

This starts `postgres`, `redis`, `backend`, `frontend`, and `nginx` (port 80
by default, `$NGINX_PORT`). A real deploy (server, not local dev) doesn't
use `--build` at all anymore — `scripts/deploy.sh` pulls the prebuilt
images `.github/workflows/docker-publish.yml` publishes on every merge to
`main` instead; see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#environment-variables) for the
full list of what changes between dev and production.

## Testing, linting, and type-checking

```bash
# Backend
cd backend
npm run lint
npm test
npx tsc --noEmit

# Frontend
cd frontend
npm run lint
npx vitest run
npx tsc --noEmit
npm run build
```

CI runs the same checks — see `.github/workflows/`.

## Security

- **Authentication & authorization** — Clerk-issued sessions are re-verified
  against our own `User` table on every request (`ClerkAuthGuard`); role is
  never trusted from a live Clerk claim. A global `RolesGuard` enforces
  `@Roles()` on every endpoint, and every user-scoped query is filtered by
  the authenticated user's own ID — no user can read another user's data.
- **Admin MFA** — admin accounts require TOTP or WebAuthn (passkey/security
  key) multi-factor authentication; TOTP secrets are stored under
  libsodium sealed-box envelope encryption, never in plaintext.
- **File uploads** — all uploads go directly to a private S3 bucket via
  short-lived presigned URLs; the app server never proxies file bytes.
  Every upload is validated against a strict content-type allowlist, the
  filename is checked for disguised/double extensions (e.g.
  `invoice.php.pdf`), and the object's actual bytes are verified against
  its declared type via file-signature (magic-byte) inspection before the
  upload is accepted — rejecting content that doesn't match what it claims
  to be.
- **Security headers** — a strict Content-Security-Policy, HSTS,
  X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and
  Permissions-Policy are set both at the nginx edge and in the backend's
  own `helmet()` configuration (defense in depth).
- **Global error handling** — a global exception filter ensures unhandled
  errors never leak internal messages/stack traces to a client; Next.js
  error boundaries (`error.tsx`, `global-error.tsx`, `not-found.tsx`) do
  the same on the frontend.
- **Rate limiting** — Redis-backed throttling in the API, plus a coarse
  IP-based limit at the nginx edge.

Full details in [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md).

## Legal

- [`LICENSE`](LICENSE) — proprietary, all rights reserved; includes the
  terms for images under `frontend/public/images/` (no use of any kind
  without prior written permission, including all project photography
  added in the future).
- Privacy Policy and Terms of Use are published on the site itself at
  `/privacy` and `/terms`.

## Documentation

- [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — authorization model,
  data ownership, and other rules the codebase enforces.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — deployment runbook.
- [`docs/DISASTER_RECOVERY.md`](docs/DISASTER_RECOVERY.md) — backup/recovery
  procedures.
- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — product requirements.
- [`docs/CREDENTIALS_CHECKLIST.md`](docs/CREDENTIALS_CHECKLIST.md) — the
  external accounts/secrets a deployment needs.

---

© 2026 United Services Egypt. All rights reserved.

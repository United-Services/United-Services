# United Services Egypt — Backend

NestJS 11 API (TypeScript, Prisma ORM 7 with `@prisma/adapter-pg`) backing
the client, candidate, and admin portals. PostgreSQL is the primary
datastore; Redis handles caching, rate-limit storage, and distributed
locks (TOTP/WebAuthn replay guards, translation-cache locking).

## Project structure

- `src/` — one directory per domain module (`candidates/`, `tickets/`,
  `rfq/`, `appointments/`, `admin-users/`, `mfa/`, `s3/`, `crypto/`,
  `auth/`, etc.), each with its own controller/service/DTOs.
- `src/common/` — shared guards (`ClerkAuthGuard`, `RolesGuard`,
  `MfaEnrolledGuard`, `MfaSessionVerifiedGuard`, `CsrfHeaderGuard`),
  decorators, filters, and utilities used across modules.
- `src/generated/prisma/` — the generated Prisma client; never hand-edit,
  regenerate with `npx prisma generate`.
- `src/scripts/` — one-off/operational scripts compiled alongside the app
  (`nest build` picks these up too) — e.g. `kek-generate.ts`/
  `kek-retire.ts`, run by `docker-entrypoint.sh` at container start.
- `scripts/` (repo-root-relative to `backend/`, not under `src/`) —
  scripts meant to run via `ts-node` directly, on a schedule outside the
  container (local crontab): `backup-db.ts`, `heartbeat.ts`,
  `fetch-secrets.mjs`/`.sh`.
- `prisma/schema.prisma` + `prisma/migrations/` — the database schema and
  migration history.

## Local development

Prerequisites: Node 22+, npm, a reachable PostgreSQL instance, a reachable
Redis instance, and a Clerk application (dev instance keys are fine
locally).

```bash
cd backend
# Create .env with real values — see docs/CREDENTIALS_CHECKLIST.md's
# ".env.example shape" section for the full list (DATABASE_URL, Clerk
# keys, AWS S3, etc.)
npm install
npm run prisma:migrate
npm run seed                 # optional: seed fixture data
npm run start:dev            # http://localhost:3002/api/v1
```

## Testing, linting, and type-checking

```bash
npm run lint
npm test
npx tsc --noEmit
```

CI runs the same checks — see `.github/workflows/ci.yml`.

## Conventions

- Every state-changing admin action must call `AuditLogService.record()` —
  see `docs/BUSINESS_RULES.md` rule 8.
- Every user-scoped query filters by the authenticated user's own ID from
  `@CurrentUser()` — never trust a client-supplied ID for ownership.
- Global guard chain (`app.module.ts`, in order): CSRF header check →
  Clerk session verification → role check → MFA enrollment check → MFA
  session-freshness check → rate limiting. See each guard's own file for
  its specific rejection reasoning.

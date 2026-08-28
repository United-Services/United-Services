# Changelog

All notable changes to this project are documented here.

## [2.0.0]

60 commits since `v1.0.0`. No breaking API/schema changes for existing
deployments — migrations are additive and backward-compatible — but tagged
as a major version given the scope of the deploy-pipeline change and the
admin-security fix below.

### Deployment & Infrastructure

- **Prebuilt, pullable Docker images.** Both `backend/Dockerfile` and
  `frontend/Dockerfile` are now real multi-stage builds — the final image
  carries only compiled output + production dependencies, no
  TypeScript/`ts-node`/`@nestjs-cli`/source files. `.github/workflows/
  docker-publish.yml` builds and pushes both to GHCR
  (`ghcr.io/alioskillers/united-services-{backend,frontend}`, multi-platform:
  `linux/amd64` + `linux/arm64`) on every merge to `main`. A deploy is now
  `docker compose pull && docker compose up -d` — no repo checkout, no
  npm/tsc toolchain on the server at all. `scripts/deploy.sh` updated to
  match (no longer rebuilds locally after pulling) and prunes dangling
  images after every run; local dev's `docker compose up --build` gets the
  same prune-after-build guidance.
- `NEXT_PUBLIC_*` env vars are now fetched from SSM and inlined at
  **image-build time** (via BuildKit `--secret` mounts, never `ARG`/`ENV`,
  so they never land in image layer history) rather than at container
  start — a consequence of the prebuilt-image model above.
- Secrets/config hardening: `fetch-secrets.mjs`'s `APP_ENV ?? 'staging'`
  hardcoded fallback removed — a missing `APP_ENV` now fails loudly with a
  clear message instead of silently querying the wrong SSM path.
  `fetch-secrets.sh`'s AWS-credential fallback fixed for macOS's bundled
  bash; `push-secrets.sh` fixed (default AWS profile, an unreachable
  skip-on-missing-key path) and now includes `APP_ENV` itself.
- Added a `KekRegistry.status` index (flagged by Supabase's index
  advisor as a sequential scan on every KEK lookup) and indexes for 7
  previously-unindexed foreign key columns plus sort-column indexes on
  admin list endpoints.
- A 6-hourly scheduler heartbeat (`backend/scripts/heartbeat.ts`, run via
  local crontab — same pattern as the existing `backup:db` job) writes an
  `INFORMATIONAL` row to the audit log, so a silently-dead cron becomes
  visible by its absence. `AuditLog.actorUserId` is now nullable to
  support this — an automated write has no human actor, and forcing one
  on would misattribute it.
- Live WebSocket updates for the open-slots appointment picker; a job
  queue, response compression, and cache headers added as part of a
  broader performance/scalability pass; expensive analytics queries
  cached; server-fetched initial data for Home/Services/Careers to avoid
  a client-fetch waterfall; prefetched dashboard specs/images with
  per-image skeletons.
- Playwright e2e tests (public site, signup, admin dashboard) and
  expanded k6 load-test coverage (positions/geo endpoints, POST rate
  limits, the WebSocket gateway).
- Paging a real phone via Betterstack when the backend throws a genuine
  unhandled 500.

### Authentication & Security

- **Fixed an admin MFA bypass**: the generic `/me/change-password`
  endpoint was `@MfaExempt()` with no current-password check, letting a
  stolen admin session cookie rotate the password and sign out other
  sessions with zero fresh MFA proof — a full account-takeover primitive.
  Already-onboarded admins are now blocked from this route and pointed at
  the properly MFA-gated `/mfa/admin-password-reset`.
- **Nonce-based CSP**: `script-src`'s `'unsafe-inline'` (the v1.0.0
  "Known Issue" below) replaced with a per-request nonce generated in
  `frontend/proxy.ts`, now the single source of truth for the policy (the
  previously-duplicated, conflicting copies in `next.config.mjs` and
  `nginx.conf` removed). `'unsafe-eval'` stays — required for Clerk's
  WebAuthn/passkey WASM crypto. Verified live across every page type with
  zero CSP violations.
- Admins can now delete/replace their own WebAuthn biometric credentials,
  with a clear error message when biometric MFA fails from an insecure
  context; an option to delete a TOTP authenticator-app enrollment too.
  Duplicate/misplaced logout buttons on the admin MFA pages cleaned up,
  and a logout option added to every error page.
- Tightened rate limiting on the Clerk webhook endpoint.
- Fixed several unhandled-Prisma-error paths (file-access `decide()`
  state machine, Redis/translation failure paths, 2 more found during a
  live API pentest) that were surfacing as generic 500s instead of
  correct, sanitized error responses — plus the underlying missing test
  coverage for those edge cases.
- Two real CSP regressions caught and fixed post-v1.0.0: one silently
  breaking Clerk's sign-in widget entirely, another blocking Clerk on the
  real production domain and the Contact page's Google Maps embed.

### Client, Candidate & Admin Portals

- Ticket system: status tracking, search, and an admin dashboard split
  out to accommodate it; resumable uploads with skeleton loading states.
- Admin service CRUD with S3-backed images.
- Sign-in/sign-up now correctly lands a user on their dashboard instead
  of the homepage; candidates auto-redirect to their dashboard right
  after signup.
- Visual pass: sign-in/signup stock photos replaced with local images,
  private/dashboard pages retinted to match the public site's lime theme,
  two real mobile-breakage bugs fixed after a pixel-level responsiveness
  audit.

### Known Issues / Accepted Trade-offs (carried over, now resolved)

- ~~CSP's `script-src` relies on `'unsafe-inline'`~~ — fixed above via
  per-request nonce.

## [1.0.0] — Initial Release

### Platform & Infrastructure

- NestJS 11 backend (TypeScript, Prisma ORM 7 with `@prisma/adapter-pg`) and
  Next.js 16 frontend (App Router, React 19, Tailwind CSS 4), migrated off
  an earlier Vite-based prototype.
- PostgreSQL (Supabase) as the primary datastore; Redis (Upstash) for
  caching, rate-limit storage, and distributed locks (TOTP/WebAuthn replay
  guards, translation-cache locking).
- Docker multi-stage builds for both apps, `docker-compose.yml` (postgres +
  redis + backend + frontend + nginx), nginx as the reverse proxy and
  edge security-header layer.
- Application logs shipped to Betterstack.
- GeoIP-based locale suggestion (MaxMind).
- Global request-tracking top-loading bar for in-flight API calls across
  the frontend.
- CI (GitHub Actions): backend typecheck/build/unit tests/`pnpm audit`,
  a real Postgres+Redis integration-test job, frontend typecheck/build/
  unit tests. Branch protection on `main` requires all three jobs to pass
  before merge; direct pushes and force-pushes are blocked.
- On-demand k6 load/stress-test workflow against public endpoints and the
  rate limiter, run manually rather than on every push.

### Authentication & Security

- Clerk-backed session auth end-to-end; every request re-verifies the
  caller's role against the app's own `User` table rather than trusting a
  live Clerk claim (`ClerkAuthGuard`).
- Mandatory MFA for admin accounts — TOTP or WebAuthn (device-bound
  biometric/security key only, not synced passkeys), re-verified on every
  new sign-in session, not just once at enrollment.
- TOTP secrets stored under libsodium sealed-box envelope encryption with
  a rotatable KEK registry (active/retiring key states); a Redis-backed
  atomic replay guard rejects a reused code even under genuinely
  concurrent submission.
- CSRF protection via a custom-header requirement on all state-changing
  requests (defends the cookie-based session against classic form-based
  CSRF).
- File uploads go directly to a private S3 bucket via short-lived
  presigned URLs; every upload is checked against a content-type
  allowlist, filenames are checked for disguised/double extensions, and
  the actual bytes are verified against the declared type via magic-byte
  inspection before being accepted.
- Global exception filter prevents internal errors/stack traces from
  leaking to clients; matching error boundaries on the frontend.
- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy) set at both the nginx edge and in
  the Next.js app itself; `X-Powered-By` suppressed.
- Fixed 7 vulnerabilities found in an internal security review, plus 2
  further bugs found during adversarial re-verification of those fixes.
- Mutation-tested the full security-critical test suite (auth guards, MFA,
  CSRF, replay protection, booking atomicity, IDOR checks) to confirm
  each test actually fails when the protection it claims to guard is
  removed, not just that it exists.
- Fixed several `findUniqueOrThrow`-on-missing-record paths (service
  lookup by slug, admin role-change/password-reset on an unknown user id,
  RFQ status-update/contacted on an unknown id) that were returning a
  generic 500 instead of a 404 — the underlying Prisma error isn't an
  `HttpException`, so the global exception filter's catch-all silently
  masked it as a 500 (properly sanitized, no leak, just the wrong status
  code).

### Client Portal

- Client signup as an 8-step wizard (own account type from Candidate).
- RFQ (request-for-quote) submission and status tracking.
- Appointment booking against admin-managed slots, with race-safe booking
  (atomic conditional update — two clients can't win the same slot).
- Service specification-file request → admin approval → short-lived
  presigned download flow.

### Candidate Portal

- Separate candidate signup/account flow (split out from client accounts).
- Application status tracking (pending/approved/denied).
- ID photo and CV upload/replacement from the candidate's own dashboard.
- Admins can request additional documents from a candidate; candidates can
  now attach any number of supporting documents (transcripts,
  certificates, portfolios, etc.) beyond the fixed ID/CV slots, each
  validated through the same presign → upload → content-check pipeline.

### Admin Dashboard

- Booking, RFQ, and candidate-application management with fuzzy search.
- User management: create accounts, change roles, disable/enable
  accounts, force a password reset — all with a hard guard against an
  admin locking themselves out or changing their own role, and full
  audit-log entries for every action.
- Open-position (careers) management, with machine-translated listing
  content (self-hosted LibreTranslate) served in en/ar/zh.
- Security section showing MFA enrollment state.
- Analytics overview and a GeoIP-based visitor-origin breakdown.

### Public Website

- Marketing pages: Home, About, Vision, Services, Projects, Careers,
  Contact, plus Privacy/Terms.
- Per-page SEO metadata, `sitemap.xml`, homepage structured data (JSON-LD).
- Interactive GeoIP world map on the homepage.
- Fully responsive, mobile-breakpoint-audited layout.

### Internationalization

- Full en/ar/zh coverage across the public site, auth/signup flows, and
  both the client and admin dashboards, including RTL support for Arabic.
- Defaults to English site-wide; only prompts a locale switch based on
  geolocation rather than forcing it.

### Testing

- Backend: unit tests across every controller/service with real
  business logic (not just scaffolding), plus a real integration-test
  suite against live Postgres + Redis.
- Frontend: Vitest + React Testing Library unit tests.
- k6 load/stress tests for public endpoints and rate-limit enforcement.

### Known Issues / Accepted Trade-offs

- Sign-out doesn't immediately revoke an already-issued session token; it
  remains valid until its own short-lived expiry. This is Clerk's
  documented stateless-verification trade-off, not app-specific behavior.
- CSP's `script-src` currently relies on `'unsafe-inline'` rather than a
  nonce-based policy — Clerk's embedded auth components rely on inline
  script/style tags outside the app's control, and a prior attempt to
  scope this further via a static content hash turned out to silently
  break Next.js's own required inline hydration scripts (hash and
  `'unsafe-inline'` don't combine the way they look like they should per
  the CSP spec). A real fix would be a fresh per-request nonce threaded
  through middleware — not yet implemented.
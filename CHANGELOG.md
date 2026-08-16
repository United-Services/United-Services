# Changelog

All notable changes to this project are documented here. This is the first
release — everything below shipped as part of `v1.0.0`.

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
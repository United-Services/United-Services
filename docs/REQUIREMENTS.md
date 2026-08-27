# United Services — Requirements

Living document. Check items off as they ship; add newly discovered ones as
phases progress. Keep in sync with `docs/BUSINESS_RULES.md`.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` shipped

## Company facts (use verbatim)

```
Address: 14S Building, El Oroba Street Extension. New Maadi, Cairo.
Tel: (+2) 0227033656
Fax: (+2) 0227033656
```

## Functional requirements

### Public site
- [x] Home, About, Vision, Services (list + detail), Contact, Careers pages
- [x] Services content sourced from DB (`Service` table), not hardcoded
- [x] Careers page lists only `OpenPosition` rows where `isOpen = true`
      (`GET /positions`)
- [x] `OpenPosition` content (title/description/department) is machine-
      translated into ar/zh on demand, cached, and re-triggered on
      publish/edit — self-hosted LibreTranslate, no billing account
      needed. `Service` content (name/short/long description — never the
      technical `specs` codes) is machine-translated the same way (see
      `docs/BUSINESS_RULES.md` rule 16).
- [x] Site available in English (default), Arabic, Chinese; navbar dropdown
      switcher + a dismissible geo-detected-language prompt (asks, never
      auto-switches). Admin surfaces and the candidate signup/status flow
      intentionally stay English in every locale; Careers, Services (both
      the marketing page and everywhere else Service content renders —
      Home's preview, the footer, the client dashboard), and all other
      public pages are fully translated.
- [x] SEO: per-page metadata, sitemap.xml, robots.txt, Open Graph,
      structured data (LocalBusiness on homepage)

### Auth & accounts
- [x] Single unified `/sign-in` — no separate admin login route/button
- [x] Custom-branded sign-in/sign-up pages (photo + gradient overlay split
      panel matching `ClientSignup`'s existing style, styled Clerk widget)
      rather than Clerk's bare default `<SignIn/>`/`<SignUp/>`
- [x] Navbar reflects auth state — "Log In" (→ `/sign-in`) when signed
      out, "Client Portal" (→ `/dashboard`) when signed in
- [x] Client signup (first/last name, phone, email, company name, password)
      → auto-redirect to client dashboard (8-step wizard)
- [x] Candidate signup (ID photo, CV, first/last name, DOB, email, password)
      → pending admin review, no dashboard (status page instead)
- [x] Role-based post-auth redirect: `/dashboard` re-derives role from our
      DB and sends client → `/client-dashboard`, admin → `/admin-dashboard`
      (or `/admin-mfa-setup` first if not yet enrolled)
- [x] Admin MFA mandatory on first sign-in (WebAuthn or TOTP)
- [x] Admin MFA re-verification required on every new sign-in, not just
      once at enrollment — `/admin-mfa-challenge` (see
      `docs/BUSINESS_RULES.md` rule 2)
- [x] Admin password reset requires fresh MFA re-verification, not email
      link (`POST /mfa/admin-password-reset`)
- [x] Admin MFA management screen (re-verify, replace credential) — Admin
      Dashboard → Security
- [x] Admin WebAuthn credentials can be deleted, not just added — `DELETE
      /mfa/webauthn/:id`, refuses to leave the account with zero working
      MFA methods (PR #28/#29)
- [x] Sign-in redirect bug fixed: `docker-compose.yml` wasn't passing
      Clerk's post-auth redirect vars as Docker **build** args, so
      `NEXT_PUBLIC_*` redirect URLs baked in as `undefined` and signed-in
      users landed on the homepage instead of `/dashboard` — fixed by
      adding them as Dockerfile `ARG`/`ENV` (PR #35)
- [x] Logout available from every error page and both admin MFA screens,
      without a duplicate/floating button (PRs #33, #34, #39)

### Client dashboard
- [x] Browse services
- [x] Request access to a service's spec file (gated on admin approval)
- [x] Submit service request / RFQ
- [x] Book an office appointment (only open slots shown; race-condition
      tested)
- [x] Securely download an approved file (short-lived presigned URL)

### Admin dashboard
- [x] View all client data (search + disable/enable)
- [x] Upload/replace each service's spec file in S3
- [x] Approve/deny file-access requests
- [x] Approve/deny candidate applications; view uploaded documents
- [x] Create/edit/close open positions — admin "Positions" section built
      (create/edit form + close/reopen), using the existing POST/PATCH
      /positions endpoints. Also fixed a real gap found along the way:
      the public Careers page was still fully mocked (hardcoded fake
      roles, never called GET /positions) despite this doc previously
      marking that `[x]` — now genuinely DB-driven, and "Apply Now"
      passes the real position id through to candidate signup
- [x] Manage appointment time slots (create slots; list/search bookings)
- [x] Add/disable any user account (`/admin/users`)
- [x] Admin can reset a *different* user's password — `POST
      /admin/users/:id/reset-password`
      (`AdminUsersController.resetPassword()`): issues a temp password via
      Clerk and forces a change on next login (`mustChangePassword`),
      audit-logged as `user.password_reset_by_admin`. Distinct from the
      MFA-gated *self*-reset flow above.
- [x] Admins cannot change their own role —
      `AdminUsersController.updateRole()` (`backend/src/admin-users/
      admin-users.controller.ts`) throws `BadRequestException` when
      `id === admin.id`, before any role mutation happens. Confirmed by
      the maintainer this restriction (carried over from an earlier
      employee-portal spec) still applies, and it's already correctly
      enforced.
- [x] Analytics & charts (single consistent accent color for KPIs) —
      `GET /analytics/overview`
- [x] Audit log with search (replaces "Recent Activity" widget)
- [x] Search bar on every management table

## Non-functional requirements
- [x] OWASP Top 10 coverage (see `docs/BUSINESS_RULES.md` + Phase 4 table)
- [x] HttpOnly + Secure cookies; parameterized queries only (Prisma)
- [x] Redis caching (public services list, `/analytics/overview` +
      `/analytics/geo-overview`, `/positions`, with safe-cache fallback so
      a Redis blip 500s neither the admin dashboard nor the public
      Careers/Services pages — PRs #37, #46) + per-route-class rate
      limiting (global throttler + tighter limit on `/analytics/track`
      and, after a full rate-limit/caching audit, on `/webhooks/clerk`,
      20/60s — PR #42)
- [x] Missing-index pass: covering indexes added for all 7 unindexed
      admin-attribution foreign-key columns (PR #40) and for the sort
      columns backing the admin list endpoints' default (no-filter)
      queries — `FileAccessRequest.requestedAt`, `ServiceRequest.
      createdAt`, `User.createdAt` (PR #41)
- [~] Automated backups + documented disaster recovery plan — runbook
      written (`docs/DISASTER_RECOVERY.md`); S3 bucket versioning now
      enabled (2026-08-13); still open: a noncurrent-version lifecycle
      rule, cross-region replication, and a practice restore
- [~] Betterstack uptime monitoring + alerting — health check + log
      shipping wired; a dashboard and alert thresholds have now been
      configured (2026-08-13) — not independently re-verified from this
      session (Betterstack-console-only action, no API credential here)
- [~] TDD from first commit; unit + integration + stress suites; CI
      coverage gate — 425 backend unit/integration tests (up from ~370
      this session, PR #46) + 10 frontend unit tests, all required in CI,
      plus k6 load/rate-limit tests (on-demand workflow); coverage spans
      every controller/service with real business logic (auth guard,
      Clerk webhook, MFA incl. WebAuthn, envelope encryption, RFQ/
      candidates/positions/services/uploads/admin-users/audit-log/
      analytics/geo), plus a round of edge-case hardening — guarded
      Redis/LibreTranslate failure paths so a Redis or LibreTranslate
      outage degrades gracefully instead of 500ing public pages, a
      candidate-application decision state-machine guard (404 on a stale
      id, conflict on re-deciding an already-decided application), upload
      ownership test coverage, and pagination-helper boundary tests (PR
      #46 — see note below for what's intentionally still
      unmocked/untested) — no minimum coverage percentage enforced as a
      CI gate
- [~] Mobile-responsive throughout — retrofitted breakpoints for the
      worst-broken layouts (ClientSignup's 50/50 split collapses to
      form-only under 860px, the 3-col service/spec-file card grids fall
      back to 1–2 cols, both dashboard sidebars shrink to an icon rail
      under 780px). Verified at the code/build level (classes render in
      HTML, media queries land in compiled CSS) — not pixel-verified in
      an actual mobile browser, no browser/screenshot tool available.
      Smaller 2-field form grids (e.g. first/last name pairs) left as-is,
      acceptable degradation rather than broken.
- [x] Strong-password enforcement with password-manager/autofill support
      (`autocomplete="new-password"` etc. throughout signup/reset forms)
- [x] Translation parity across en/ar/zh for all pages that are meant to
      be translated (see public-site note above for the pages that
      intentionally stay English)
- [x] Every request the backend receives resolves to a normal HTTP
      response (4xx/5xx as appropriate) — never an unhandled crash — and
      every frontend dashboard call handles its own failure instead of
      leaving the page stuck (see `docs/BUSINESS_RULES.md` rules 14–15)

## Style rules carried over from frontend
- [x] No emojis anywhere in UI or generated content — the last holdouts
      (sidebar nav icons + logout button in both dashboards) replaced with
      a small inline-SVG icon set (`components/NavIcons.tsx`)
- [x] All numeric/stat values render in one consistent accent color
- [x] Remove leftover "USE · SHEET 01 · COMPANY OVERVIEW" placeholder
      heading wherever it still appears
- [x] Home icon/button in navbar on every page, linking to `/` (logo
      click)
- [x] Company logo present in every header/footer spot — dashboard
      sidebars, ClientSignup, and CandidateSignup now use the real logo
      image instead of a text badge

## Explicitly deferred — not attempted this session

- **Coverage gate/threshold**: unit + integration tests run in CI as
  required steps (backend: 425 unit + integration tests against real
  Postgres+Redis; frontend: 10 unit tests, Vitest) and k6 load/rate-limit
  tests run on demand (`.github/workflows/load-test.yml`), but no minimum
  coverage percentage is enforced anywhere. Every backend
  controller/service with real business logic has a spec file now (auth
  guard + self-heal provisioning, the Clerk webhook — the sole place a
  role is ever assigned, TOTP envelope encryption + KEK rotation, WebAuthn
  register/verify/delete with challenge-replay and cross-user-credential
  checks, admin password reset (both self and admin-on-other-user),
  RFQ/candidates/positions/services/uploads/admin-users/audit-log/
  analytics/geo). Left deliberately untested as thin wrappers with no real
  logic of their own: S3Service (AWS SDK passthrough), RedisService
  (ioredis subclass), PrismaService (connection bootstrap),
  BetterstackLogger (log transport), and main.ts (covered indirectly by
  the e2e app-boot test instead).
- **Actual deployment — domain still pending**: `docs/DEPLOYMENT.md`
  documents the plan (architecture, hosting options, env vars, release
  process, rollback, scaling), and the app is now genuinely running as a
  live Docker Compose stack (backend, frontend, nginx) against real cloud
  services (Supabase/S3/Redis/Clerk/Betterstack) — this session's PRs were
  routinely built, redeployed, and verified live through that stack, not
  just locally. What's still missing is a public domain: no domain has
  been acquired, no Cloudflare zone/TLS exists yet. Domain acquisition is
  being handled by an external IT contact, not a task item for whoever
  picks up this doc next.

## Open questions for the team
- None open as of 2026-08-27. The only standing question ("admins
  cannot change their own role") was confirmed by the maintainer and
  moved into Admin dashboard above.

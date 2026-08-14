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
- [x] Site available in English (default), Arabic, Chinese; navbar dropdown
      switcher + a dismissible geo-detected-language prompt (asks, never
      auto-switches). Services, admin surfaces, and the candidate
      signup/status flow intentionally stay English in every locale;
      Careers and all other public pages are fully translated.
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
- [x] Admin password reset requires fresh MFA re-verification, not email
      link (`POST /mfa/admin-password-reset`)
- [x] Admin MFA management screen (re-verify, replace credential) — Admin
      Dashboard → Security

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
- [x] Add/disable any user account (`/admin/users`) — admin **password
      reset** for clients/candidates still goes through Clerk's own flow;
      no dedicated backend endpoint for an admin to reset another user's
      password
- [x] Analytics & charts (single consistent accent color for KPIs) —
      `GET /analytics/overview`
- [x] Audit log with search (replaces "Recent Activity" widget)
- [x] Search bar on every management table

## Non-functional requirements
- [x] OWASP Top 10 coverage (see `docs/BUSINESS_RULES.md` + Phase 4 table)
- [x] HttpOnly + Secure cookies; parameterized queries only (Prisma)
- [x] Redis caching (public services list) + per-route-class rate limiting
      (global throttler + tighter limit on `/analytics/track`)
- [~] Automated backups + documented disaster recovery plan — runbook
      written (`docs/DISASTER_RECOVERY.md`); S3 bucket versioning now
      enabled (2026-08-13); still open: a noncurrent-version lifecycle
      rule, cross-region replication, and a practice restore
- [~] Betterstack uptime monitoring + alerting — health check + log
      shipping wired; a dashboard and alert thresholds have now been
      configured (2026-08-13) — not independently re-verified from this
      session (Betterstack-console-only action, no API credential here)
- [~] TDD from first commit; unit + integration + stress suites; CI
      coverage gate — 107 backend unit/integration tests + 10 frontend
      unit tests, all required in CI, plus k6 load/rate-limit tests
      (on-demand workflow); coverage spans every controller/service with
      real business logic (auth guard, Clerk webhook, MFA incl. WebAuthn,
      envelope encryption, RFQ/candidates/positions/services/uploads/
      admin-users/audit-log/analytics/geo — see note below for what's
      intentionally still unmocked/untested) — no minimum coverage
      percentage enforced as a CI gate
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
  required steps (backend: 105 unit + 2 e2e against real Postgres+Redis;
  frontend: 10 unit tests, Vitest) and k6 load/rate-limit tests run on
  demand (`.github/workflows/load-test.yml`), but no minimum coverage
  percentage is enforced anywhere. Every backend controller/service with
  real business logic has a spec file now (auth guard + self-heal
  provisioning, the Clerk webhook — the sole place a role is ever
  assigned, TOTP envelope encryption + KEK rotation, WebAuthn
  register/verify with challenge-replay and cross-user-credential checks,
  admin password reset, RFQ/candidates/positions/services/uploads/
  admin-users/audit-log/analytics/geo). Left deliberately untested as
  thin wrappers with no real logic of their own: S3Service (AWS SDK
  passthrough), RedisService (ioredis subclass), PrismaService
  (connection bootstrap), BetterstackLogger (log transport), and main.ts
  (covered indirectly by the e2e app-boot test instead).
- **Admin resetting another user's password**: exists for admins
  resetting *their own* password (MFA-gated); there's no endpoint for an
  admin to force-reset a client/candidate's password. Explicitly out of
  scope per instruction — not attempted.
- **Actual deployment**: `docs/DEPLOYMENT.md` now documents the plan
  (architecture, hosting options, env vars, release process, rollback,
  scaling) but neither app has actually been deployed anywhere — no
  domain chosen, no Cloudflare zone created, everything still runs from
  local dev against real cloud services (Supabase/S3/Redis/Clerk/
  Betterstack).

## Open questions for the team
- [ ] Confirm whether "admins cannot change their own role" restriction
      (carried over from an earlier employee-portal spec) still applies to
      this app's admin model.

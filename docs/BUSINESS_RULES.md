# United Services — Business Rules

Living document — the source of truth for authorization and workflow
decisions that aren't obvious from the schema alone. Update whenever a rule
changes or a new one is discovered during implementation.

1. A file-access request can only be approved by an Admin — never
   auto-approved by any system path.
2. Only Admin accounts require MFA. Client and Candidate accounts do not.
   Enforced server-side, not just as a frontend redirect: `MfaEnrolledGuard`
   rejects any request to an admin-scoped route from an admin account with
   `mfaEnrolled: false`, with an explicit exemption only for the MFA
   enrollment endpoints themselves (`MfaController`, `@MfaExempt()`).
   Enrollment is a permanent, one-time fact about the account — it is
   **not** proof that the current sign-in verified the second factor.
   `MfaSessionVerifiedGuard` enforces the latter separately, keyed on the
   Clerk session id (`sid` claim), not the user id: an admin must
   re-verify (TOTP code or WebAuthn) once per new session — enrolling
   once does not exempt every future login forever. `POST
   /mfa/challenge/totp` and `POST /mfa/webauthn/auth-verify` are the two
   endpoints that satisfy it; both mark only the session that called them,
   via `MfaService.markSessionVerified`.
   The "biometric" enrollment option is deliberately restricted to a
   device-bound platform authenticator (Touch ID/Face ID/Windows Hello) —
   `authenticatorSelection: { authenticatorAttachment: 'platform',
   residentKey: 'discouraged', userVerification: 'required' }` in
   `MfaService.webauthnRegisterOptions`. `'cross-platform'` would also
   accept a roaming USB/NFC security key, and a resident/discoverable key
   is what turns a credential into a synced, usernameless *passkey*
   (iCloud Keychain/Google Password Manager) — neither is what "biometric"
   is meant to offer here. WebAuthn has no protocol-level way to require
   fingerprint specifically over face/PIN; "platform + required user
   verification" is the closest available restriction.
3. A client cannot see another client's data. Only Admin has cross-client
   visibility. Every client-scoped query must filter by the authenticated
   user's own `id`/`companyName` — never trust a client-supplied id param.
4. A booked appointment slot must disappear from availability for everyone
   else immediately on booking — no double-booking. Enforced via a Prisma
   `$transaction` that checks `isBooked = false` and flips it atomically.
5. Candidate applications are always reviewed by a human Admin before
   approval or denial. There is no auto-approval path.
6. Admins cannot change their own role — **carried over from an earlier
   employee-portal spec; unconfirmed for this app's admin model.** Treat as
   active until the team confirms otherwise (see open question in
   `docs/REQUIREMENTS.md`).
7. Admin password reset requires a fresh MFA verification (TOTP code or
   WebAuthn assertion) — never an email-link reset for admin accounts.
8. Every admin action that changes state (approve/deny, file upload,
   account enable/disable, password reset, role/MFA change) is written to
   `AuditLog`.
9. Service spec files are never publicly listable or guessable — access is
   only ever granted through request → admin approval → short-lived
   presigned download URL. S3 keys additionally include a random UUID
   component so they can't be enumerated even if a key were ever leaked
   outside that flow, and every upload lands under a `pending/` prefix
   first — the presigned PUT URL that wrote it stays valid until its TTL
   expires (S3 presigned URLs are not single-use), so nothing trusts or
   serves that key until its content has been validated (magic-byte
   check) and it's been promoted (S3 copy + delete) to its permanent key.
10. Analytics user counts exclude admins — "how many users/companies" charts
    are derived from `client` (and, where noted, `candidate`) accounts only.
11. A TOTP code can only ever be used once, even if it's still within its
    verification tolerance window — `MfaService` tracks each user's last
    accepted time step (via otplib's `afterTimeStep`) and rejects a repeat.
12. Every state-changing (non-GET/HEAD/OPTIONS) API request must carry the
    `X-Requested-With: XMLHttpRequest` header (`CsrfHeaderGuard`) — auth
    here is cookie-based (`ClerkAuthGuard` checks the session cookie before
    an Authorization header), and a plain cross-site HTML form can't set
    custom headers, so this is what actually stops a forged cross-site
    POST from riding an authenticated session. Only the Clerk webhook
    (`@CsrfExempt()`, server-to-server, authenticated by its own signature
    verification) is excused from this.
13. The rate limiter's per-IP fairness depends on `trust proxy` (in
    `backend/src/configure-app.ts`) matching the *actual* number of
    reverse-proxy hops in front of the app — currently `1` (nginx only).
    This must be updated any time the proxy topology changes. In
    particular, adding Cloudflare in front of nginx (planned, not yet
    done — `docs/DEPLOYMENT.md`) does **not** raise this to `2`: nginx's
    own `real_ip` module is required to resolve Cloudflare's hop first, so
    from the app's perspective there's still exactly one hop asserting the
    client IP either way. Skipping that nginx-side config once Cloudflare
    is added collapses every visitor into the same rate-limit bucket —
    silently, with no error — since the app would then trust an
    unresolved (and Cloudflare-spoofable) forwarded-for value instead of
    the real visitor IP. See `docs/DEPLOYMENT.md`'s Cloudflare setup step
    for the required nginx config.
14. No request path may ever crash the backend process. `AllExceptionsFilter`
    is registered globally (`APP_FILTER`) and catches everything, returning
    a generic 500 for anything that isn't already an `HttpException` —
    never leaking `error.message`/stack to the client. `main.ts`'s
    `unhandledRejection`/`uncaughtException` process handlers are
    log-only and must never call `process.exit()`.
15. Every frontend dashboard API call must handle its own 4xx/5xx/network
    failure — no page may be left silently stuck in a loading state (or,
    worse, an infinite one) on a failed request. The shared convention is
    `lib/errors.ts`'s `getErrorMessage()` + `components/ErrorBanner.tsx`
    for load/action failures; `CandidateDashboard`'s local `message` state
    is the one deliberate exception (pre-existing pattern that already
    covered its one gap, kept rather than replaced to avoid two competing
    conventions in the same file). Any load function that's callable from
    more than one place (a mount effect *and* a search box / retry button
    / post-action refresh) must additionally guard against out-of-order
    responses with `lib/useRequestGuard.ts` — otherwise a slow earlier
    request can resolve after a faster later one and silently overwrite
    fresher state with stale data.
16. `Service` and `OpenPosition` content are both machine-translated via
    `TranslationService` + self-hosted LibreTranslate (see
    `docker-compose.yml`'s `libretranslate` service — no billing account
    required, unlike Google Cloud Translation). The public Services page,
    Home's services preview, the footer's services list, and the client
    dashboard all render `Service` records directly from the DB (not
    static i18n content), so this covers what a visitor/client actually
    sees, not just the admin/dashboard views. For `Service`, only
    `name`/`shortDescription`/`longDescription` are translated — `specs`
    (technical standard codes like "API 15CLT Compliant", "DN50 – DN600")
    is never run through machine translation and always stays as stored,
    in every locale; see `TranslationService`'s `SERVICE_FIELDS` constant.
    Cached per `(contentType, contentId, locale)` in `ContentTranslation`,
    invalidated by comparing a hash of the live source fields against the
    hash stored at translation time — not a hash column on `OpenPosition`/
    `Service` themselves, so adding translation support never touched
    either model's own write paths. Concurrent requests for the same
    untranslated item must never produce more than one LibreTranslate
    call — enforced with a Redis lock
    (`lock:translation:{contentType}:{id}:{locale}`); a request that
    loses the lock race polls briefly, then falls back to English rather
    than blocking indefinitely. Admin surfaces (beyond the Services
    content covered above) and the candidate signup/status flow still
    intentionally stay English everywhere — see `docs/REQUIREMENTS.md`'s
    public-site note.
17. `super_admin` is a strict superset of `admin` — same dashboard, same
    sign-in flow, same mandatory MFA (enrollment + per-session
    verification, rule 2 applies to both). Both `MfaEnrolledGuard`/
    `MfaSessionVerifiedGuard` and every admin-only controller check
    against `ADMIN_ROLES` (`common/constants/admin-roles.ts`), never a
    bare `role === Role.admin`, specifically so this stays true —
    forgetting to include `super_admin` somewhere would silently exempt
    it from MFA, not just from a permission. Two exclusive extra
    features: **audit log** (`AuditLogController`) and **tickets**
    (`TicketsController`'s `list`/`updateStatus`) reject a plain admin,
    enforced with `@Roles(Role.super_admin)` — never `ADMIN_ROLES` — on
    those specific routes/controllers. Frontend hides the corresponding
    nav items/sections for a plain admin (`views/AdminDashboard.tsx`),
    but that's UX only; the backend `@Roles` decorator is the actual
    boundary. Privilege escalation is closed at the source: only an
    existing `super_admin` can grant the `super_admin` role (creating a
    new account or promoting an existing one) or modify an existing
    `super_admin` account at all (disable/enable/role-change/password-
    reset) — see `AdminUsersController.assertCanGrantRole`/
    `assertCanActOnTarget`. A plain admin can still fully manage every
    other role, including other plain admins.
18. `AuditLog` rows older than 90 days (`AuditLogArchiveService`'s
    `AUDIT_LOG_RETENTION_DAYS`) are moved into `AuditLogArchive` — same
    fields plus `originalId`/`archivedAt` — rather than deleted outright,
    and rather than kept forever in the hot table. This never runs inline
    on a request: `AuditLogArchiveWorker` registers one BullMQ job
    scheduler (`audit-log-archive-daily`, `0 3 * * *`) via
    `queue.upsertJobScheduler`, so a repeat cron dependency was never
    added just for this. The mover itself moves rows in batches of
    `ARCHIVE_BATCH_SIZE` (500) — one `$transaction` (`createMany` on
    `AuditLogArchive`, then `deleteMany` on `AuditLog`) per batch, with a
    `BATCH_DELAY_MS` (250ms) pause between batches — specifically so a
    large backlog can't lock up `AuditLog` or hammer the DB in one shot.
    `createMany`'s `skipDuplicates: true` on `originalId` (unique) is what
    makes a retry after a mid-batch crash safe: a still-present `AuditLog`
    row that was already archived (createMany succeeded, deleteMany
    didn't) is skipped on re-insert, then actually deleted this time — no
    duplicate archive rows, no rows lost. A run that fails outright
    retries per BullMQ's own `attempts`/`backoff` (3 attempts, exponential
    from 30s); once exhausted, the job moves to `AUDIT_ARCHIVE_DLQ`
    exactly like `TranslationWorker`'s DLQ, rather than disappearing
    silently — see `AuditLogArchiveWorker`.
19. Postgres and Redis automatically fail over to an always-on local
    standby (`backend/src/failover/`) if Supabase/Upstash becomes
    unreachable, and fail back automatically once it recovers — see
    `docs/DISASTER_RECOVERY.md`'s "Automatic Postgres + Redis failover"
    section for the full design. The one rule this interacts with
    directly: rule 4's booking guard (`isBooked=false` conditional
    update) is what `FailoverReconciliationWorker` relies on to detect a
    genuine double-booking across a partition — a replayed booking whose
    conditional update no longer matches on primary is recorded in
    `FailoverConflict` rather than silently discarded or overwritten.
    Every other model's writes during a fallback window replay as a
    last-write-wins upsert once primary recovers.

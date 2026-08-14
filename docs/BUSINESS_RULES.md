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

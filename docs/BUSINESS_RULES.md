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

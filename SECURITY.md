# Security Policy

## Reporting a Vulnerability

Please report suspected security vulnerabilities privately through
**[GitHub Security Advisories](../../security/advisories/new)** ("Report a
vulnerability" under this repo's Security tab) rather than opening a
public issue or pull request. This lets us assess and fix the problem
before any details are public.

Please include:

- The affected component/endpoint and a description of the issue.
- Steps to reproduce, or a proof-of-concept if you have one.
- The potential impact as you understand it.

We'll acknowledge new reports within a few business days and follow up
with a fix timeline once we've reproduced and assessed the issue.

## Scope

This repository contains the production platform for United Services
Egypt: a public marketing site, client/candidate portals, and an internal
staff dashboard (`frontend/`, `backend/`, and the Docker/nginx deployment
config at the repo root). In scope: authentication and MFA flows,
authorization/role checks, file-access and RFQ/appointment workflows, the
API surface under `backend/src/`, and the deployment configuration itself
(`docker-compose.yml`, `nginx/`, CI workflows).

Out of scope: third-party services we depend on but don't operate
(Clerk, Supabase, AWS S3, Betterstack, Cloudflare) — report issues in
those directly to their own security teams. Denial-of-service and rate
limiting reports are also out of scope unless they bypass an intended
authorization boundary.

## Supported Versions

This is a continuously-deployed application, not a versioned library —
only the current `main` branch (what's actually running in production)
is supported. There are no older versions to report against.

## Our Security Practices

A few things worth knowing before reporting:

- All admin/super-admin accounts require MFA (TOTP or WebAuthn),
  enforced server-side by dedicated guards — not just a frontend
  redirect. See `docs/BUSINESS_RULES.md` rule 2.
- Every state-changing API request is authenticated (Clerk session
  cookie), CSRF-protected, and role-checked against an explicit
  allow-list — there's no default-open route.
- Sensitive fields (TOTP secrets, etc.) are encrypted at rest with
  AES-256-GCM under a rotatable key-encryption-key scheme — see
  `backend/src/crypto/`.
- Every admin action that changes state is written to an audit log
  (`docs/BUSINESS_RULES.md` rule 8), with automatic archival after 90
  days.
- Dependencies are scanned and this repo receives security patches on an
  ongoing basis; we don't maintain parallel supported release lines.

If in doubt about whether something is a vulnerability worth reporting
here versus a design tradeoff already documented in
`docs/BUSINESS_RULES.md`, report it anyway — we'd rather triage a
non-issue than miss a real one.

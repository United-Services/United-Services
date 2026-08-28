# United Services Egypt

**United Services Egypt (USE)** provides corrosion-control and pipeline
integrity services to the oil, gas, and power sectors — GRE tubular
lining, FBE coating, external anti-corrosion wrapping, HDPE lining, RTP
systems, and RTV insulator coating — engineered and manufactured in Cairo
since 2005 and serving clients across Egypt, Iraq, Saudi Arabia, and the
UAE.

This repository is the company's digital platform: the public website,
the client and job-candidate portals, and the internal staff dashboard
used to run day-to-day operations.

## What this platform does

**For visitors and prospective clients** — a public website presenting
the company, its services, and past projects, available in English,
Arabic, and Chinese, with a contact form and a request-for-quote flow.

**For clients** — a private account area to submit and track
requests-for-quote, book service appointments against real availability,
raise and follow up on support tickets, and request technical
specification documents for a given service.

**For job applicants** — a dedicated application portal to apply for open
positions, upload a CV/ID and any supporting documents, and track
application status through to a decision.

**For staff** — an internal dashboard to manage client requests,
bookings, and candidate applications; publish and edit open positions and
service content; manage staff accounts and permissions; and review
platform activity and visitor analytics. Administrator accounts require a
second authentication factor (an authenticator app or a security
key/fingerprint) to protect this area.

## Where things stand

See [`CHANGELOG.md`](CHANGELOG.md) for what has shipped release by
release, and [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) for the
running list of features, in progress and planned.

## Trust & security, in plain terms

- Every private page and every request is checked against the signed-in
  user's own account and role — a client can never see another client's
  requests, and only administrators can reach staff-only tools.
- Administrator accounts require a second authentication factor on top of
  a password, so a leaked password alone can't grant access.
- Uploaded files (CVs, ID documents, specifications) are checked to make
  sure their actual content matches what they claim to be, and are stored
  privately — never made public by default.
- The platform monitors itself: unhandled errors are logged and paged to
  an on-call phone rather than silently failing, and the site has
  automated protection against being overwhelmed by excessive traffic.
- A full internal security review was carried out before launch, with
  findings tracked and fixed; see [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md)
  for the underlying rules the platform enforces.

## Legal

- [`LICENSE`](LICENSE) — proprietary, all rights reserved; includes the
  terms for images under `frontend/public/images/` (no use of any kind
  without prior written permission, including all project photography
  added in the future).
- Privacy Policy and Terms of Use are published on the site itself at
  `/privacy` and `/terms`.

## Documentation

- [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — the access and
  data-ownership rules the platform enforces.
- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — product requirements
  and shipped/planned features.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — deployment runbook.
- [`docs/DISASTER_RECOVERY.md`](docs/DISASTER_RECOVERY.md) — backup and
  recovery procedures.
- [`docs/CREDENTIALS_CHECKLIST.md`](docs/CREDENTIALS_CHECKLIST.md) — the
  external accounts and secrets a deployment needs.

## For developers

Technical stack, local setup, Docker, and testing/CI instructions have
moved out of this file — see
[`backend/AGENTS.md`](backend/AGENTS.md) and
[`frontend/AGENTS.md`](frontend/AGENTS.md) for how each app is built and
its internal conventions, and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
for how the platform is actually deployed and operated.

---

© 2026 United Services Egypt. All rights reserved.

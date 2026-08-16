# Credentials & Secrets Checklist

Everything the backend build needs, where to get it, and how to hand it to
Claude Code without ever putting a real secret in a chat window or a commit.

**Golden rule:** never paste an actual secret value into this chat, into
Claude Code's chat panel, or into any file that gets committed to git. Put
real values only in a local `.env` file (already git-ignored) that Claude
Code reads directly off disk. The "`.env.example` shape" section below
shows the *shape*, not real values — there's no template file in the repo
to copy; create `.env` yourself using that section as the reference.

---

## 0. Free tier limits — check this before adding anything new

| Service | Free tier | Watch out for |
|---|---|---|
| Supabase | 500MB DB, 1GB storage, 5GB egress, 50k MAU | Only 2 active projects; a free project **pauses after 1 week of inactivity** |
| Clerk | 50,000 MRU | Billed on *retained* users (return after 24h), not raw signups |
| AWS S3 | Accounts created after July 2025 get a one-time **$200 AWS credit for 6 months** (all services combined), not an ongoing free allowance | Budget for a small recurring charge once the credit window closes — should stay cents/month at this project's file volumes |
| AWS KMS | **No meaningful free tier for asymmetric keys** — flat $1/mo per key regardless of usage, and `Encrypt`/`Decrypt`/`GetPublicKey` on asymmetric keys are excluded from the 20k free-requests allowance | Don't use for TOTP encryption — use the local libsodium provider (see §10) instead |
| Betterstack | 10 monitors, 10 heartbeats, 1 status page, 100k tracked exceptions/mo | Log ingestion volume has its own cap on the free plan — keep log verbosity/retention modest |
| Upstash Redis | 256MB data, 500k commands/month, 10GB bandwidth | If rate-limiting checks every request against Redis, this is the limit most likely to get hit first |
| MaxMind GeoLite2 | Free forever (downloaded DB, not billed per request) | None |
| Cloudflare | Free plan covers WAF/CDN/DDoS basics | Fine for this project's needs |
| Domain registration | Never free | Small unavoidable annual cost |

---

## 1. Supabase (database)

**What you need:**
- `DATABASE_URL` — pooled Postgres connection string (for the running app)
- `DIRECT_URL` — direct (non-pooled) connection string (for Prisma migrations)
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` (only if you end up using any
  Supabase client-side features beyond raw Postgres — otherwise Prisma +
  the connection strings above are enough)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, only if using Supabase's own
  APIs/RLS features — keep it out of the frontend entirely if you use it at all)

**Where to get it:** Supabase Dashboard → your project → **Project Settings
→ Database** for the connection strings (there's a toggle for "Connection
pooling" — grab both the pooled and direct URLs), and **Project Settings →
API** for the URL/anon/service-role keys.

---

## 2. Clerk (authentication)

**What you need:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (safe for the frontend, starts `pk_`)
- `CLERK_SECRET_KEY` (server-only, never in frontend code, starts `sk_`)
- `CLERK_WEBHOOK_SECRET` (for the `user.created`/`user.updated` webhook that
  syncs role/company data into your own `User` table — see Phase 1 of the
  backend prompt)

**Where to get it:** the Clerk CLI setup (`clerk init --app
app_3HpWvpvAs49Plz4CoBIbHmncDsE`) writes the publishable + secret keys into
your `.env` automatically once you're signed in via `clerk auth login` — you
don't need to copy these by hand. For the webhook secret specifically: Clerk
Dashboard → your app → **Webhooks** → create an endpoint pointing at
`/api/v1/webhooks/clerk` → copy the **Signing Secret** it generates.

---

## 3. AWS S3 (file storage)

**What you need:**
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — for an IAM user scoped to
  only this bucket (least privilege — don't reuse a root/admin AWS key)
- `AWS_REGION`
- `S3_BUCKET_NAME`

**Where to get it, step by step:**
1. AWS Console → **S3** → Create bucket (block all public access — leave
   every "block public access" box checked, the app will only ever serve
   files through short-lived presigned URLs).
2. AWS Console → **IAM** → Users → Create user (programmatic access only,
   no console login needed).
3. Attach a **custom policy** (not a broad managed policy) that only allows
   `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on
   `arn:aws:s3:::<your-bucket-name>/*` — this way even if the key leaks, the
   blast radius is one bucket.
4. On that IAM user, generate an **access key** (Security credentials tab →
   Create access key → "Application running outside AWS") and copy the key
   ID + secret **once** (AWS only shows the secret at creation time).

**Cost note:** if this AWS account was created after July 2025, S3 usage
draws from a one-time $200/6-month credit shared across all AWS services
rather than a permanent free allowance — see §0. Actual usage cost at this
project's file volumes (spec PDFs, candidate CVs/IDs) should still be a few
cents/month once the credit period ends.

---

## 4. Betterstack (monitoring/logging/on-call paging)

**What you need:**
- `BETTERSTACK_SOURCE_TOKEN` (for log shipping)
- `BETTERSTACK_HEARTBEAT_URL` or monitor API key (for uptime checks)
- `BETTERSTACK_INCIDENT_API_TOKEN` — a **separate** token from the log
  source token above, scoped for incident creation only. Paired with
  `ALERTING_ENABLED=true` and `BETTERSTACK_REQUESTER_EMAIL`, this pages a
  real phone (via whatever escalation policy is configured in Betterstack)
  the moment the backend throws a genuine 5xx — see
  `backend/src/alerting/`. Real secret — goes through the SSM pipeline
  (`scripts/push-secrets.sh`), never committed.
- `BETTERSTACK_REQUESTER_EMAIL` — the email address on the Betterstack
  account creating the incident. Not really a secret, but small/low-risk
  enough to just set alongside the token in whatever `.env` is in use.
- `ALERTING_ENABLED` — plain flag, `true`/`false`, **not** a secret. Leave
  unset or `false` everywhere except the real production server — without
  this gate, every local dev exception while actively coding would page
  whoever's on call.

**Where to get it:** Betterstack Dashboard → **Logs → Sources** → create a
source (choose "Node.js"/"HTTP" as the integration) → copy the source token.
For uptime: **Uptime → Monitors** → create a monitor for your health-check
endpoint, or create a **Heartbeat** if you want the app itself to ping
Betterstack on a schedule. For on-call paging specifically: **Uptime →
On-Call** → create/confirm an escalation policy with a real notification
method (push/SMS/call — check what your plan actually supports), then
**Uptime → Settings → API tokens** → generate a token scoped for incident
creation (not the logging token). Send one manual test incident via `curl`
before wiring it into the app to confirm the escalation policy actually
pages a phone end to end — see `docs/DEPLOYMENT.md`'s "On-call alerting"
section for the exact command.

---

## 5. Redis (caching + rate limiting)

**What you need:**
- `REDIS_URL` (host, port, password, and whether TLS is required — depends
  on provider)

**Where to get it:** decide the provider first — either a managed option
(Upstash or Redis Cloud both have a generous free tier and give you a
connection URL immediately on signup), or a self-hosted Redis instance on
the same physical server (in which case there's no external "credential" to
fetch, just a local connection string and a strong password you set
yourself in the Redis config).

---

## 6. Domain / DNS / Cloudflare

**What you need now:** access to whichever registrar the `use-egypt.com` (or
final) domain is registered with, so DNS records can be pointed at the
physical server.

**What you'll need later (Phase 16 of the backend prompt):** a Cloudflare
account with that domain added as a zone, once you're ready to put it in
front of the server for WAF/CDN/DDoS protection. No action needed until then
— just don't lock in DNS/TLS assumptions that would make adding Cloudflare
painful later (the backend prompt already flags this).

---

## 7. Geo-IP for automatic language detection

**What you need:** a way to map a visitor's IP to a country/language on
first visit. Two options, pick one:
- **MaxMind GeoLite2** — free, no per-request API key needed; you download
  their database file (requires a free MaxMind account to get a license
  key for the download, but no runtime API key or per-request cost).
- **A hosted geo-IP API** (ipapi.co, ipinfo.io, etc.) — simpler to wire up,
  but needs an `API_KEY` env var and has a request quota on the free tier.

Either is fine for this use case; a hosted API is faster to implement if
you want to move quickly, MaxMind is better once traffic is high (matches
the "high traffic" concern already raised) since it's a local lookup with
no external call per request.

---

## 8. WebAuthn (admin biometric MFA)

**No external credential needed** — WebAuthn is a browser API, not a hosted
service. The only two things to get right in config:
- `RP_ID` must exactly match your production domain (e.g. `use-egypt.com`,
  no protocol/port).
- `RP_ORIGIN` must be the full origin (`https://use-egypt.com`).
Both need updating when you go from local dev → staging → production, since
WebAuthn credentials are bound to the origin they were registered on.

---

## 9b. TOTP key-encryption key (admin MFA secret encryption)

**No external credential or paid service needed.** Per §0, AWS KMS is not
free for this, so the default provider is the local libsodium sealed-box
path. What you need instead is a one-time generated keypair, kept as a
*file* rather than a hosted credential:

1. Run the keypair-generation script Claude Code adds for this (e.g.
   `npm run kek:generate`) — it writes a public/private keypair to disk.
2. Store the **private key file** outside the git repo, permissions `0400`,
   owned only by the service's OS user — never commit it, never put its
   contents directly in `.env` as a string (a file path is fine in `.env`,
   the key material itself should not be).
3. Set `TOTP_KEK_PROVIDER=local` and `TOTP_KEK_PRIVATE_KEY_PATH=` (the file
   path from step 2) in `.env`.

If you later decide the $1/mo-per-key cost is worth it (e.g. once revenue
justifies AWS KMS's hardware-backed key isolation and CloudTrail audit
trail), flip `TOTP_KEK_PROVIDER=kms` and fill in `KMS_TOTP_KEY_ALIAS` — the
interface already supports both without a code change.

---

## 9. Email (only if you add notification emails beyond what Clerk sends)

Clerk handles auth-related emails (verification, password reset) on its
own — no separate credential needed for that. If you later want the app to
email admins when a new RFQ/appointment/candidate application comes in,
you'll need a transactional email provider (Resend, SendGrid, Postmark —
any of them) and its `API_KEY`. Not required to start; flagging so it's not
a surprise later.

---

## `.env.example` shape (no template file in the repo — create `.env` yourself using this)

```
# Supabase
DATABASE_URL=
DIRECT_URL=

# Clerk (auto-populated by `clerk init`)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=

# Betterstack
BETTERSTACK_SOURCE_TOKEN=
BETTERSTACK_HEARTBEAT_URL=

# On-call phone paging (real server only — leave ALERTING_ENABLED unset
# or false everywhere else, see section 4)
ALERTING_ENABLED=false
BETTERSTACK_INCIDENT_API_TOKEN=
BETTERSTACK_REQUESTER_EMAIL=

# Redis
REDIS_URL=

# Geo-IP (pick one path from section 7)
GEOIP_PROVIDER=maxmind   # or: hosted-api
GEOIP_API_KEY=           # only if GEOIP_PROVIDER=hosted-api

# WebAuthn
WEBAUTHN_RP_ID=
WEBAUTHN_RP_ORIGIN=

# TOTP key-encryption key (default: local, $0 — see section 9b)
TOTP_KEK_PROVIDER=local   # or: kms
TOTP_KEK_PRIVATE_KEY_PATH=
KMS_TOTP_KEY_ALIAS=       # only if TOTP_KEK_PROVIDER=kms

# App
API_GLOBAL_PREFIX=api/v1
```

## Handing these to Claude Code safely

1. Create `.env` in the project root using the shape above.
2. Fill in real values yourself, directly in that file (not in chat).
3. Confirm `.env` is listed in `.gitignore` before the first commit.
4. Tell Claude Code "the `.env` is filled in, continue" rather than pasting
   any value — it can read the file itself once it exists on disk.

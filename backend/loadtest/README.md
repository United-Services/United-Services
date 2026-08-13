# Load / stress tests (k6)

Two scripts, both hitting only the **public, unauthenticated** surface of
the API (`/health`, `/services`) — see the comment at the top of each
script for why authenticated flows (RFQ, booking, file-access) aren't
covered here, and where the appointment double-booking race condition is
instead verified (unit-test level, not load-test level).

- `public-endpoints.js` — a realistic single/small-client traffic
  baseline. SLO: p95 < 300ms, < 1% errors. Actual measured baseline
  locally: p95 ≈ 6ms against a warm Redis cache.
- `rate-limit-enforcement.js` — deliberately bursts past the global
  100 req/min-per-IP throttle (`app.module.ts`) from one IP and asserts
  the API actually starts returning 429, not just that the limiter is
  configured.

## Running locally

Needs a running instance with a real Postgres + Redis behind it (the
disposable stack the `backend-integration` CI job uses works — see
`.github/workflows/ci.yml`):

```sh
pnpm run build
pnpm run kek:generate  # needs DATABASE_URL + KEK_KEYS_DIR set — see below
DATABASE_URL=... DIRECT_URL=... REDIS_URL=... TOTP_KEK_PROVIDER=local KEK_KEYS_DIR=./secrets/kek \
  CLERK_SECRET_KEY=... AWS_REGION=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
  S3_BUCKET_NAME=... WEBAUTHN_RP_ID=... WEBAUTHN_RP_ORIGIN=... CORS_ORIGINS=... \
  node dist/main.js &

k6 run loadtest/public-endpoints.js
k6 run loadtest/rate-limit-enforcement.js
```

Or against any already-running instance:

```sh
k6 run -e BASE_URL=https://api.use-eg.com/api/v1 loadtest/public-endpoints.js
```

Not wired into the required CI gate — load tests are slow and noisy
compared to unit/integration tests, so they run on demand via the
`Load test` workflow (`workflow_dispatch` in GitHub Actions), not on
every push.

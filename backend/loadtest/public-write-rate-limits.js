import http from 'k6/http';
import { check, sleep } from 'k6';

// Proves the per-endpoint Throttle() overrides on the three public,
// unauthenticated POST endpoints actually engage at their configured
// budgets, not just the global 100/min default rate-limit-enforcement.js
// already covers. Each of these is deliberately tighter than the global
// limit because it's public, unauthenticated, and would otherwise be a
// cheap abuse surface (spam tickets, forged analytics events, wasted
// presigned S3 upload URLs):
//   - POST /analytics/track   -> 30 req/min per IP  (AnalyticsController)
//   - POST /tickets/presign   -> 10 req/min per IP  (TicketsController)
//   - POST /tickets           ->  5 req/min per IP  (TicketsController)
//
// Each runs as its own single-VU, one-IP-worth-of-traffic scenario so the
// three budgets don't interfere with each other (k6 gives every scenario
// its own VU pool, but they still share the test-runner's source IP —
// that's fine here since the assertion is just "429s start appearing
// once each endpoint's own budget is exhausted", not an exact count).
//
// All three require the CsrfHeaderGuard's X-Requested-With header on
// state-changing requests (see common/guards/csrf-header.guard.ts) even
// though they're @Public() — CSRF exemption and auth exemption are
// separate concerns in this codebase.
//
//   k6 run loadtest/public-write-rate-limits.js
//   k6 run -e BASE_URL=https://api.use-eg.com/api/v1 loadtest/public-write-rate-limits.js

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3002/api/v1';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
};

export const options = {
  scenarios: {
    track_burst: {
      executor: 'constant-vus',
      exec: 'trackBurst',
      vus: 1,
      duration: '75s',
    },
    ticket_presign_burst: {
      executor: 'constant-vus',
      exec: 'presignBurst',
      vus: 1,
      duration: '75s',
    },
    ticket_create_burst: {
      executor: 'constant-vus',
      exec: 'createTicketBurst',
      vus: 1,
      duration: '75s',
    },
  },
  thresholds: {
    // Each budget only means something if it actually fires during this run.
    'checks{check:track_429_after_budget}': ['rate>0'],
    'checks{check:presign_429_after_budget}': ['rate>0'],
    'checks{check:create_429_after_budget}': ['rate>0'],
  },
};

export function trackBurst() {
  const res = http.post(
    `${BASE_URL}/analytics/track`,
    JSON.stringify({ eventType: 'load_test_probe' }),
    { headers: jsonHeaders },
  );
  check(
    res,
    { track_429_after_budget: (r) => r.status === 429 },
    { check: 'track_429_after_budget' },
  );
  // No sleep — deliberately exceeding the 30/min budget as fast as
  // possible from this one VU/IP.
}

export function presignBurst() {
  const res = http.post(
    `${BASE_URL}/tickets/presign`,
    JSON.stringify({ contentType: 'image/png' }),
    { headers: jsonHeaders },
  );
  check(
    res,
    { presign_429_after_budget: (r) => r.status === 429 },
    { check: 'presign_429_after_budget' },
  );
}

export function createTicketBurst() {
  const res = http.post(
    `${BASE_URL}/tickets`,
    JSON.stringify({
      name: 'Load Test',
      email: 'load-test@example.com',
      type: 'non_technical',
      details: 'k6 rate-limit boundary probe — safe to ignore/delete.',
    }),
    { headers: jsonHeaders },
  );
  check(
    res,
    { create_429_after_budget: (r) => r.status === 429 },
    { check: 'create_429_after_budget' },
  );
}

export function handleSummary(data) {
  const lines = [
    ['track', 'analytics/track', 30],
    ['presign', 'tickets/presign', 10],
    ['create', 'tickets', 5],
  ].map(([key, path, limit]) => {
    const passes =
      data.metrics[`checks{check:${key}_429_after_budget}`]?.values
        ?.passes ?? 0;
    return `  ${path} (limit ${limit}/min): ${passes} requests rejected with 429`;
  });
  console.log(`\nRate-limit boundary results:\n${lines.join('\n')}`);
  return { stdout: '' };
}

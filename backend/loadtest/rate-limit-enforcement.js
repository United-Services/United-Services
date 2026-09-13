import http from 'k6/http';
import { check, sleep } from 'k6';

// Proves the global rate limiter (app.module.ts: 100 req/min per IP,
// Redis-backed) actually engages under a real burst, not just that it's
// configured. A single VU fires requests as fast as possible from one IP
// — every real client shares this exact shape of exposure — and the test
// asserts the API starts responding 429 once the budget is exhausted.
//
// Deliberately targets /services, not /health: HealthController is
// @SkipThrottle() (correct — health checks/load-balancer probes must
// never be rate-limited), so a version of this test that hit /health
// could never see a 429 regardless of whether the global limiter was
// actually working. Confirmed live: running this against /health saw
// 0/788 requests rejected over 70s — not proof the limiter was broken,
// just proof this test was checking the one endpoint deliberately
// exempted from it.
//
//   k6 run loadtest/rate-limit-enforcement.js
//   k6 run -e BASE_URL=https://api.use-eg.com/api/v1 loadtest/rate-limit-enforcement.js

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3002/api/v1';

export const options = {
  scenarios: {
    burst_from_one_ip: {
      executor: 'constant-vus',
      vus: 1,
      duration: '70s',
    },
  },
  thresholds: {
    // The control only means something if it actually fires at least once
    // during this run.
    'checks{check:got_429_after_budget_exhausted}': ['rate>0'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/services`);
  check(
    res,
    { got_429_after_budget_exhausted: (r) => r.status === 429 },
    { check: 'got_429_after_budget_exhausted' },
  );
  // No sleep — this scenario is explicitly trying to exceed the budget as
  // fast as one VU can.
}

export function handleSummary(data) {
  const total = data.metrics.http_reqs?.values?.count ?? 0;
  const throttled = data.metrics['checks{check:got_429_after_budget_exhausted}']?.values?.passes ?? 0;
  console.log(`\n${total} requests sent from one IP; ${throttled} were rejected with 429 once the 100/min budget ran out.`);
  return { stdout: '' };
}

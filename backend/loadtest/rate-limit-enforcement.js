import http from 'k6/http';
import { check, sleep } from 'k6';

// Proves the global rate limiter (app.module.ts: 100 req/min per IP,
// Redis-backed) actually engages under a real burst, not just that it's
// configured. A single VU fires requests as fast as possible from one IP
// — every real client shares this exact shape of exposure — and the test
// asserts the API starts responding 429 once the budget is exhausted.
//
//   k6 run loadtest/rate-limit-enforcement.js
//   k6 run -e BASE_URL=https://api.use-eg.com/api/v1 loadtest/rate-limit-enforcement.js

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3001/api/v1';

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
  const res = http.get(`${BASE_URL}/health`);
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

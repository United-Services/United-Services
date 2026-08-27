import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Baseline load test for the public, unauthenticated surface of the API —
// the pages every visitor hits regardless of login state. Establishes the
// RPS/latency baseline docs/REQUIREMENTS.md flagged as missing (Phase 12).
//
// This models one realistic client (or a small handful sharing an egress
// IP, e.g. an office/NAT) browsing the site — NOT a burst from a single
// IP, which would legitimately trip the global rate limiter configured in
// app.module.ts (100 req/min per IP; see rate-limit-enforcement.js for a
// test that exercises THAT control on purpose). Real traffic is
// distributed across many client IPs, each with their own 100/min budget,
// so this script deliberately paces itself under that ceiling.
//
// Authenticated flows (RFQ submission, appointment booking, file-access
// requests) are NOT load-tested here: ClerkAuthGuard verifies a real
// Clerk-issued session token server-side, and k6 has no way to mint one
// without live Clerk test credentials wired in — future work. The
// appointment double-booking race condition itself IS covered, at the
// transaction-logic level, by
// backend/src/appointments/appointments.controller.spec.ts.
//
// Run locally against the disposable Postgres+Redis stack used by the
// "backend-integration" CI job:
//   pnpm run build && node dist/main &
//   k6 run loadtest/public-endpoints.js
// Or point BASE_URL at any other running instance:
//   k6 run -e BASE_URL=https://api.use-eg.com/api/v1 loadtest/public-endpoints.js

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3002/api/v1';

const errorRate = new Rate('errors');
const healthDuration = new Trend('health_duration', true);
const servicesDuration = new Trend('services_duration', true);
const positionsDuration = new Trend('positions_duration', true);
const geoLocaleDuration = new Trend('geo_locale_duration', true);

export const options = {
  scenarios: {
    // 3 concurrent "clients", ~1 request pair every 2s each — comfortably
    // under the 100 req/min-per-IP throttle (~90 req/min at full tilt).
    steady_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 3 },
        { duration: '30s', target: 3 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Baseline SLO: 95% of requests to public, Redis-cached endpoints
    // complete in under 300ms, with under 1% errors.
    http_req_duration: ['p(95)<300'],
    errors: ['rate<0.01'],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  healthDuration.add(health.timings.duration);
  errorRate.add(health.status !== 200);
  check(health, { 'health is 200': (r) => r.status === 200 });

  const services = http.get(`${BASE_URL}/services`);
  servicesDuration.add(services.timings.duration);
  errorRate.add(services.status !== 200);
  check(services, {
    'services is 200': (r) => r.status === 200,
    'services returns an array': (r) => Array.isArray(r.json()),
  });

  // Careers page — same cache-aside pattern as /services (Redis, 300s
  // TTL, per-locale bucket), added when PositionsController grew that
  // cache. Not previously exercised by this baseline.
  const positions = http.get(`${BASE_URL}/positions`);
  positionsDuration.add(positions.timings.duration);
  errorRate.add(positions.status !== 200);
  check(positions, {
    'positions is 200': (r) => r.status === 200,
    'positions returns an array': (r) => Array.isArray(r.json()),
  });

  // Cheap, uncached, IP-derived locale lookup — hit on every first page
  // load to pick a default language. No DB/Redis involved, but it's still
  // public surface the baseline hadn't touched.
  const geoLocale = http.get(`${BASE_URL}/geo/locale`);
  geoLocaleDuration.add(geoLocale.timings.duration);
  errorRate.add(geoLocale.status !== 200);
  check(geoLocale, {
    'geo/locale is 200': (r) => r.status === 200,
    'geo/locale has a locale field': (r) =>
      typeof r.json('locale') === 'string',
  });

  sleep(2);
}

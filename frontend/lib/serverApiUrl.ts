// Server Components only — see lib/api.ts's top comment for the full
// reasoning (container-to-container URL vs the browser-facing one).
// These three ISR pages build their fetch URL directly with `new URL()`
// rather than going through the shared axios instance, so they need the
// same fallback logic duplicated here rather than in lib/api.ts.
export const SERVER_API_BASE_URL =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL

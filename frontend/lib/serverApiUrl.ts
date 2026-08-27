// Server Components only — see lib/api.ts's top comment for the full
// reasoning (container-to-container URL vs the browser-facing one).
// These three ISR pages build their fetch URL directly with `new URL()`
// rather than going through the shared axios instance, so they need the
// same fallback logic duplicated here rather than in lib/api.ts.
//
// Trailing slash is load-bearing: `new URL(relativePath, base)` only
// APPENDS relativePath onto base's own path (.../api/v1/services) when
// base ends in '/' AND relativePath has no leading '/' — a leading '/'
// on either side makes the URL spec treat it as absolute-from-origin,
// silently discarding the /api/v1 prefix entirely (new URL("/services",
// "http://host/api/v1") resolves to "http://host/services", not
// ".../api/v1/services"). Confirmed live: this was actually happening,
// 404-looping every ~30s against the backend directly once
// INTERNAL_API_URL made the failure visible instead of nginx quietly
// redirect-then-swallowing it. Call sites must use a relative path with
// no leading slash, e.g. new URL("services", SERVER_API_BASE_URL).
const rawBase = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ""
export const SERVER_API_BASE_URL = rawBase.endsWith("/") ? rawBase : `${rawBase}/`

import { NextRequest, NextResponse } from "next/server"
import { clerkMiddleware } from "@clerk/nextjs/server"
import createIntlMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"

const intlMiddleware = createIntlMiddleware(routing)

// Single source of truth for CSP — see docs/BUSINESS_RULES.md and the prior
// nginx.conf/next.config.mjs copies of this policy (both removed; a fresh
// nonce has to be generated per-request, which only a proxy/middleware can
// do — a static header value baked into nginx.conf or next.config.mjs's
// headers() can't). Every request through this middleware gets a unique
// nonce; script-src trusts it instead of 'unsafe-inline', so an attacker
// who gets a payload into the page (stored/reflected XSS) still can't get
// it to execute — they'd have to guess the current request's nonce, which
// is impossible.
//
// This intentionally does NOT add 'strict-dynamic': clerk-js inserts its
// own <script src="https://clerk.use-eg.com/..."> tag directly into the
// page rather than having it inserted by an already-nonce'd script, so it
// only loads under the plain host-allowlist entries below — 'strict-dynamic'
// would cause CSP-aware browsers to ignore those host entries entirely and
// break Clerk. Untested against a real browser without it kept out.
//
// style-src keeps 'unsafe-inline' — dropping it would need every inline
// style={{}} prop across the app (dynamic values, can't be nonce'd the same
// way as <script> tags) rewritten to CSS classes first; out of scope here,
// tracked as a separate follow-up.
function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV !== "production"
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // clerk.use-eg.com: this app's production Clerk instance uses a custom
    // Frontend API domain (not the default *.clerk.accounts.dev) — needed
    // in script-src (loading clerk-js itself) and connect-src (its API
    // calls). Confirmed live previously: without it, clerk-js failed to
    // load at all on the real production domain ("failed_to_load_clerk_js").
    // 'unsafe-eval' is required too, not optional: clerk-js evaluates code
    // dynamically as part of its WASM-backed WebAuthn/passkey crypto —
    // without it the <SignIn>/<SignUp> widget fails to mount at all.
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.use-eg.com`,
    // clerk-js spawns a Web Worker from a blob: URL — falls back to
    // script-src when worker-src is unset, but a blob: worker isn't covered
    // by the host-based clerk allowlist there, so it needs its own entry.
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    // In production this app only ever runs behind nginx, which proxies
    // /api/* same-origin — no cross-origin API call ever happens there.
    // Local `pnpm dev` has no nginx in front, so the frontend calls the
    // backend directly at NEXT_PUBLIC_API_URL (http://localhost:3002) —
    // allow that origin in connect-src only outside production. Same
    // reasoning for support-agent's own separate backend
    // (NEXT_PUBLIC_SUPPORT_AGENT_API_URL, default http://localhost:8000
    // — see lib/useChatStream.ts): confirmed live this was missing
    // entirely (browser CSP blocked the fetch() before it ever left the
    // page, distinct from and unrelated to support-agent's own
    // DB-backed CORS allowlist, which only governs whether *it* accepts
    // an incoming cross-origin request, not what this page's own JS is
    // permitted to initiate).
    [
      "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.use-eg.com https://clerk-telemetry.com https://*.s3.us-east-1.amazonaws.com",
      isDev ? "http://localhost:3002" : "",
      isDev ? (process.env.NEXT_PUBLIC_SUPPORT_AGENT_API_URL ?? "http://localhost:8000") : "",
    ]
      .filter(Boolean)
      .join(" "),
    // The Contact page embeds a real Google Maps iframe (views/Contact.tsx)
    // — www.google.com covers a consent/cookie redirect Maps embeds
    // sometimes go through.
    "frame-src https://*.clerk.accounts.dev https://*.clerk.com https://www.google.com https://maps.google.com",
  ].join("; ")
}

// First-time visitors always land on the English site (routing.defaultLocale).
// We don't auto-redirect based on geo IP anymore — instead a client-side
// prompt (see components/LanguagePrompt.tsx) asks the visitor whether they'd
// like to switch to their geo-detected language, and only switches on an
// explicit "yes".
//
// No route-matching auth gate here (previously createRouteMatcher-based,
// now removed — see Clerk's deprecation notice: path matching can diverge
// from how Next.js actually routes a request, e.g. this list never even
// included /candidate-dashboard). Every actual data access is independently
// re-checked against our own DB by the backend's ClerkAuthGuard/RolesGuard,
// and every dashboard/admin-mfa-setup page.tsx already does its own
// server-side auth()+role re-check and redirect before rendering (see
// docs/BUSINESS_RULES.md) — that per-page check was always the real gate;
// this file only ever added a redundant, incompletely-covered pre-filter.
// intlMiddleware only ever makes sense for page routes — it exists to
// resolve/redirect to a locale-prefixed path. Running it against
// /internal-log (browser-side Betterstack log shipping — see
// instrumentation-client.ts) or /api/* rewrites the request to a
// locale-prefixed path that doesn't exist there (e.g. /en/internal-log),
// which 404s since these routes intentionally live outside app/[locale].
// The "/(api|trpc)(.*)" matcher entry below is Clerk's, not next-intl's
// — it needs every request (API routes included) to run through
// clerkMiddleware for auth context, but that doesn't mean intlMiddleware
// should also run on them. (/api/* itself is proxied straight to the
// backend container by nginx/nginx.conf's `location /api/` and never
// actually reaches this app at all in the real deployment — this
// exclusion only matters for whatever hits this middleware directly,
// e.g. local `next dev` with no nginx in front.)
const NON_PAGE_PATHS = ["/api/", "/internal-log"]

export default clerkMiddleware((_auth, req) => {
  const { pathname } = req.nextUrl
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = buildCsp(nonce)

  // Set as a REQUEST header (not just the response) so Next.js can read it
  // during server rendering and auto-apply this exact nonce to its own
  // framework/hydration scripts — see "Reading the nonce" in
  // node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
  // The response header below is what the browser actually enforces.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)

  if (NON_PAGE_PATHS.some((p) => pathname.startsWith(p))) {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set("Content-Security-Policy", csp)
    return response
  }

  // next-intl needs to see the same nonce-bearing request so whatever page
  // it resolves to (including a locale redirect target) renders with a
  // matching nonce — clone the request with the extra header before
  // handing it off, same as NextResponse.next({request:{headers}}) above.
  const requestWithNonce = new NextRequest(req, { headers: requestHeaders })
  const response =
    intlMiddleware(requestWithNonce) ??
    NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
})

export const config = {
  matcher: [
    "/((?!_next|sitemap\\.xml|robots\\.txt|[^?]*\\.(?:html?|css|js(?!on)|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
}

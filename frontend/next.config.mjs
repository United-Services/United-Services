import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained .next/standalone/ folder (a minimal node_modules
  // subset + server.js) so the Docker image doesn't need the full
  // node_modules tree copied in at runtime. See Dockerfile.
  output: "standalone",
  // Next sets "X-Powered-By: Next.js" on every response by default — pure
  // information disclosure (confirms the stack to a scanner/attacker for
  // no benefit), and nginx doesn't strip it either. Off entirely rather
  // than stripped downstream.
  poweredByHeader: false,
  // Defense in depth: nginx/nginx.conf sets the same headers at the edge in
  // production, but this app can also be hit directly (local dev, health
  // checks, or if it's ever run without the nginx layer in front of it), so
  // the headers live here too rather than only at the proxy.
  // next-intl's message extractor does a dynamic import() with a
  // non-literal specifier purely for its own internal formatjs tooling —
  // unrelated to any code this app ships. Webpack can't statically analyze
  // it for persistent-cache invalidation and logs a warning on every
  // build/dev start; it's an infrastructure-level log (webpack's
  // FileSystemInfo), not a compilation warning, so `ignoreWarnings` can't
  // filter it — this is the actual knob for that class of message. Only
  // touches webpack (Turbopack, the dev default, ignores this callback
  // entirely), and only silences 'warn'-level infra logs — real errors
  // still surface.
  webpack: (config) => {
    config.infrastructureLogging = { level: "error" }
    return config
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Mirrors nginx/nginx.conf's Content-Security-Policy — keep both
          // in sync. NOTE: nginx.conf's script-src also carried a sha256
          // hash alongside 'unsafe-inline' (meant to cover the JSON-LD
          // block in src/app/[locale]/page.tsx's structuredData); that
          // combination doesn't work the way it looks — per the CSP spec,
          // 'unsafe-inline' is ignored entirely once ANY hash/nonce source
          // is present in the same directive (it's not an OR/fallback).
          // Confirmed live in a browser: with the hash present, Next's own
          // required inline hydration scripts got silently blocked on
          // every page. Dropped the hash here (and should be dropped from
          // nginx.conf too) — script-src falls back to plain
          // 'unsafe-inline', which is weaker (no longer restricts inline
          // scripts to known-good content) but is what was actually in
          // effect anyway once Clerk's own inline script/style tags are
          // accounted for. A real fix would be nonce-based CSP (a fresh
          // nonce per request, threaded through middleware to every inline
          // script) — bigger effort, not done here.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data: https://fonts.gstatic.com",
              // In production this app only ever runs behind nginx, which
              // proxies /api/* same-origin — no cross-origin API call ever
              // happens there. Local `pnpm dev` has no nginx in front, so
              // the frontend calls the backend directly at
              // NEXT_PUBLIC_API_URL (http://localhost:3002) — allow that
              // origin in connect-src only outside production so this CSP
              // doesn't silently block every API call in local dev.
              [
                "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
                process.env.NODE_ENV !== "production" ? "http://localhost:3002" : "",
              ]
                .filter(Boolean)
                .join(" "),
              "frame-src https://*.clerk.accounts.dev https://*.clerk.com",
            ].join("; "),
          },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)

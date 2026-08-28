import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

/** @type {import('next').NextConfig} */
const nextConfig = {
  // No longer "standalone" — the Dockerfile is single-stage now (full
  // node_modules present at runtime either way, npm install/build happen
  // in docker-entrypoint.sh at container start), and `next start` is
  // incompatible with standalone's own server.js output ("next start"
  // does not work with "output: standalone" — confirmed live, the app
  // came up on the wrong invocation path). Plain `next build` + `next
  // start` needs no special output mode.
  // Unsplash-sourced photography (project thumbnails in Projects.tsx,
  // the client-signup/sign-in split-panel photo) needs an explicit
  // remotePattern before next/image will optimize it — local /images/...
  // assets need no entry here.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
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
          // Content-Security-Policy is NOT set here anymore. It now needs a
          // fresh nonce on every request (script-src trusts the nonce
          // instead of 'unsafe-inline'), and this headers() config runs
          // once at build time — there's no per-request value it could ever
          // see. proxy.ts (middleware, which does run per-request) is the
          // single source of truth for it now; see buildCsp() there.
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)

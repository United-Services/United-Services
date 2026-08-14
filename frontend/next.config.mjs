import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained .next/standalone/ folder (a minimal node_modules
  // subset + server.js) so the Docker image doesn't need the full
  // node_modules tree copied in at runtime. See Dockerfile.
  output: "standalone",
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
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)

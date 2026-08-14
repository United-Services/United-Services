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

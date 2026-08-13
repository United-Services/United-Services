import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained .next/standalone/ folder (a minimal node_modules
  // subset + server.js) so the Docker image doesn't need the full
  // node_modules tree copied in at runtime. See Dockerfile.
  output: "standalone",
}

export default withNextIntl(nextConfig)

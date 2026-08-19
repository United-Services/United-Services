# syntax=docker/dockerfile:1

# ── deps ─────────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A syntactically valid Clerk publishable key is required for `next build`
# to succeed even though nothing is actually reachable at build time — the
# real key is supplied at container runtime via docker-compose env vars.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2ktcGxhY2Vob2xkZXIta2V5LmNsZXJrLmFjY291bnRzLmRldiQ
ARG NEXT_PUBLIC_API_URL=http://localhost:3002/api/v1
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# .next/standalone already contains a minimal node_modules subset + a
# self-contained server.js (next.config.mjs: output: 'standalone') — no
# separate npm install needed in the runtime stage.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

RUN chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/en').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

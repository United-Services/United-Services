# syntax=docker/dockerfile:1

# ── deps ─────────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app
# node:22-slim has no OpenSSL — Prisma's query engine needs it to detect
# the right libssl variant, and silently guesses (and can fail to load
# at runtime) without it. See https://pris.ly/d/engine-not-found-openssl.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client generation only needs a schema-valid DATABASE_URL — it
# doesn't connect. Real migrations run as a separate step at deploy time
# (`npm run prisma:deploy`), never baked into the image.
RUN DATABASE_URL="postgresql://user:password@localhost:5432/build" \
    DIRECT_URL="postgresql://user:password@localhost:5432/build" \
    npx prisma generate
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
# geoipupdate: downloads the GeoLite2-Country database GeoService reads
# (see docker-entrypoint.sh) — a missing/stale DB doesn't break anything
# (GeoService falls back to 'en'/null on a failed open), but without this
# the admin dashboard's country analytics would just silently never work
# in any Docker deployment.
RUN apt-get update -y && apt-get install -y openssl geoipupdate && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nestjs

COPY package.json package-lock.json ./
# Full install (not --omit=dev): the entrypoint needs the `prisma` CLI
# (migrate deploy) and `ts-node` (one-time kek:generate bootstrap on a
# fresh DB) at container start, both devDependencies. Trades a larger
# image for a simple, reliable entrypoint over a fragile separate
# compile-scripts-with-a-second-tsc-invocation step.
# NODE_ENV is deliberately NOT set yet — npm skips devDependencies
# entirely when NODE_ENV=production is already set at install time.
RUN npm ci
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# TOTP KEK private keys live here — mount a real volume in production
# (docker-compose.yml does this). Never bake a real key into the image.
# geoip-db is the same story: a real volume in production so the
# downloaded .mmdb survives restarts instead of re-fetching on every one.
RUN mkdir -p /app/secrets/kek /app/geoip-db && chown -R nestjs:nodejs /app

USER nestjs
EXPOSE 3002

# The app's own /api/v1/health does a real DB round-trip — good enough as
# a container healthcheck without adding a separate dependency.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3002)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]

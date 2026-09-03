# syntax=docker/dockerfile:1

# Multi-stage: the final image carries only compiled JS + production
# dependencies — no TypeScript, no @nestjs/cli, no source .ts files. This
# is a deliberate reversal of the earlier single-stage approach (installing
# the whole dev toolchain + source and building at container start): that
# traded a slow, tool-heavy image for baking nothing environment-specific
# in — but the app never bakes anything build-time-secret either way (every
# secret is read from env at runtime via SSM in docker-entrypoint.sh, never
# inlined into compiled output the way frontend/Dockerfile's NEXT_PUBLIC_*
# vars are), so that trade bought nothing here. A prebuilt image lets a
# deploy be `docker compose pull && up -d` — no repo checkout, no npm/tsc
# on the server at all.
FROM node:22-slim AS build
WORKDIR /app

# openssl: Prisma's query engine needs it at generate time too, not just
# at runtime, to detect the right libssl variant. --no-install-recommends:
# skips openssl's recommended-but-unneeded extras — smaller layer, nothing
# this build actually uses.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Generates src/generated/prisma from prisma/schema.prisma — `npm run
# build` (nest build) needs the generated client's types to compile
# against; a schema-valid DATABASE_URL is enough, no reachable DB needed
# (matches how CI's own `prisma generate` step works).
RUN npx prisma generate && npm run build

# ---

FROM node:22-slim AS runtime
WORKDIR /app

# geoipupdate lives in Debian's "contrib" component, not "main" — sed it
# into sources.list.d before apt-get update or "no installation candidate"
# even though the package exists. ca-certificates: node:22-slim has no
# system root CA bundle; geoipupdate is a separate Go binary that uses the
# *system* store and fails outright without this ("x509: certificate
# signed by unknown authority", confirmed live). openssl: same Prisma
# engine-detection reason as the build stage, needed again at runtime.
#
# Deliberately not pinning exact package=version here (a Codacy
# suggestion, not applied): Debian's apt mirrors purge old package
# versions as the distro rolls forward, so a hardcoded version pin
# eventually starts failing a from-scratch build with "unable to locate
# package" — a real, recurring failure mode for pinned apt versions on
# a rolling base image, not a hypothetical. node:22-slim's own tag
# already pins what actually matters for reproducibility (the Debian
# release these packages come from).
RUN sed -i 's/^Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources \
    && apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates geoipupdate && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --create-home --uid 1001 --gid nodejs nestjs

COPY package.json package-lock.json ./
# --omit=dev: no typescript/@nestjs/cli/ts-node/jest/eslint in the final
# image. `prisma` (the migrate-deploy CLI docker-entrypoint.sh needs at
# every container start) is a regular dependency, not a devDependency —
# see package.json — specifically so it survives this.
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# prisma/ (schema + migrations, not the generated client — that's already
# inside dist/generated via nest-cli.json's asset-copy config) is needed
# at runtime for `prisma migrate deploy` to know what to apply.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY scripts/fetch-secrets.sh scripts/fetch-secrets.mjs ./scripts/
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# TOTP KEK private keys live here — mount a real volume in production
# (docker-compose.yml does this). Never bake a real key into the image.
# geoip-db is the same story: a real volume in production so the
# downloaded .mmdb survives restarts instead of re-fetching on every one.
# Only chown these two dirs, not `-R /app` — chowning the whole tree
# (node_modules included) after npm ci forces the overlay filesystem to
# materialize a near-duplicate of that ~500MB layer just for a metadata
# change (confirmed live: a blanket `chown -R /app` here alone added
# ~420MB to the image). nestjs only ever needs to *write* under these two
# directories; everything else it just reads, which the default
# root-owned-but-world-readable permissions from COPY/npm ci already allow.
RUN mkdir -p /app/secrets/kek /app/geoip-db && chown -R nestjs:nodejs /app/secrets /app/geoip-db

USER nestjs
EXPOSE 3002

# The app's own /api/v1/health does a real DB round-trip — good enough as
# a container healthcheck without adding a separate dependency. Short
# start-period now that npm install/nest build no longer happen inside
# this window — the image already has everything compiled in.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3002)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]

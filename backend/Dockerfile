# syntax=docker/dockerfile:1

# Single-stage: the image itself only carries source code + system/global
# tooling. `npm install`, `npm run build`, secret-fetching, migrations, and
# starting the app all happen at container start (docker-entrypoint.sh),
# not baked into the image at `docker build` time. Trade-off, deliberate:
# slower container starts (a real npm install + nest build every start) in
# exchange for secrets being available before the app ever needs them and
# nothing environment-specific ever being baked into an image layer.
FROM node:22-slim
WORKDIR /app

# openssl: Prisma's query engine needs it to detect the right libssl
# variant (https://pris.ly/d/engine-not-found-openssl). geoipupdate: lives
# in Debian's "contrib" component, not "main" — sed it into sources.list.d
# before apt-get update or "no installation candidate" even though the
# package exists.
RUN sed -i 's/^Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources \
    # ca-certificates: node:22-slim has no system root CA bundle. Node's
    # own HTTPS calls (Prisma, S3, etc.) don't need it — Node bundles its
    # own CA store — but geoipupdate is a separate Go binary that uses the
    # *system* store, and fails outright without this package
    # ("x509: certificate signed by unknown authority", confirmed live
    # the first time this path ran with real GeoIP credentials).
    && apt-get update -y && apt-get install -y openssl ca-certificates geoipupdate && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    # --create-home: without it, this system user has no $HOME at all, and
    # `npm install` (which now runs as this user at container start, not
    # as root at image-build time) fails outright trying to create its
    # cache/log directory under a nonexistent /home/nestjs. Confirmed live.
    && useradd --system --create-home --uid 1001 --gid nodejs nestjs

# Global CLI tooling for the core frameworks this app is built on — `npm
# install` below still installs @nestjs/cli/typescript as local
# devDependencies too (that's what `npm run build`/`nest build` actually
# resolve and use), but these globals make the same commands runnable
# directly by name inside the container, not just through `npm run`.
RUN npm install -g @nestjs/cli typescript

COPY . .
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
# a container healthcheck without adding a separate dependency. A longer
# start-period than the old multi-stage image's, since npm install + nest
# build now happen inside this window too, not before the image existed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3002)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]

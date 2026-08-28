# syntax=docker/dockerfile:1

# Multi-stage: the final image carries only the built Next.js app +
# production dependencies — no TypeScript, no source .ts/.tsx files. This
# reverses the earlier single-stage approach (installing the whole dev
# toolchain + source, building at container start).
#
# The one real wrinkle building this way: `next build` inlines every
# NEXT_PUBLIC_* var directly into the compiled JS bundle at build time, not
# read at runtime like a normal env var — so those have to be fetched from
# AWS SSM Parameter Store *during `docker build`*, not at container start
# like every other secret. That means whoever builds this image needs SSM
# access. Passed in as BuildKit secrets (`--secret id=...`), never as
# `ARG`/`ENV` — those get baked into image layer history, readable forever
# via `docker history`; a secret mount only exists inside the one RUN step
# that reads it. See docker-publish.yml / DEPLOYMENT.md for the actual
# `docker build --secret ...` invocation.
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .

RUN --mount=type=secret,id=aws_access_key_id \
    --mount=type=secret,id=aws_secret_access_key \
    --mount=type=secret,id=aws_region \
    --mount=type=secret,id=app_env \
    sh -c ' \
      export AWS_ACCESS_KEY_ID="$(cat /run/secrets/aws_access_key_id)" && \
      export AWS_SECRET_ACCESS_KEY="$(cat /run/secrets/aws_secret_access_key)" && \
      export AWS_REGION="$(cat /run/secrets/aws_region)" && \
      export APP_ENV="$(cat /run/secrets/app_env)" && \
      echo "[build] fetching secrets from AWS SSM Parameter Store..." && \
      eval "$(node ./scripts/fetch-secrets.mjs)" && \
      npm run build \
    '

# ---

FROM node:22-slim AS runtime
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --create-home --uid 1001 --gid nodejs nextjs

COPY package.json package-lock.json .npmrc ./
# --omit=dev: no typescript/eslint/playwright/etc in the final image.
RUN npm ci --omit=dev
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs
# proxy.ts (middleware) is NOT needed here — Next compiles it into
# .next/server/middleware.js at build time and `next start` only ever
# loads that compiled output, never the source file.
COPY --from=build /app/i18n ./i18n
COPY --from=build /app/messages ./messages
COPY scripts/fetch-secrets.sh scripts/fetch-secrets.mjs ./scripts/
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Only .next, not `-R /app` — chowning the whole tree (node_modules
# included) after npm ci forces the overlay filesystem to materialize a
# near-duplicate of that layer just for a metadata change (same issue
# confirmed live on backend/Dockerfile). `next start` writes ISR/fetch
# cache entries under .next/cache at runtime, so nextjs needs write access
# there; everything else it only reads.
RUN chown -R nextjs:nodejs /app/.next
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Short start-period now that npm install/next build no longer happen
# inside this window — the image already has everything built in.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/en').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]

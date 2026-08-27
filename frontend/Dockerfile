# syntax=docker/dockerfile:1

# Single-stage: the image itself only carries source code + global
# tooling. `npm install`, secret-fetching, `npm run build`, and starting
# the app all happen at container start (docker-entrypoint.sh), not baked
# into the image at `docker build` time. Trade-off, deliberate: slower
# container starts (a real npm install + next build every start) in
# exchange for every NEXT_PUBLIC_* build-time var coming from SSM at
# start, never a hardcoded/placeholder value baked into an image layer.
FROM node:22-slim
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    # --create-home: without it, this system user has no $HOME, and
    # `npm install` (which now runs as this user at container start, not
    # as root at image-build time) fails trying to create its cache/log
    # directory under a nonexistent home dir. Confirmed live on the
    # backend image; applying the same fix here preemptively.
    && useradd --system --create-home --uid 1001 --gid nodejs nextjs

# Global CLI tooling for the core frameworks this app is built on — `npm
# install` below still installs next/typescript as local devDependencies
# too (that's what `npm run build`/`next build` actually resolve and use),
# but these globals make the same commands runnable directly by name
# inside the container, not just through `npm run`.
RUN npm install -g next typescript

COPY . .
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

RUN chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Longer start-period than before — npm install + next build now happen
# inside this window too, not before the image existed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/en').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]

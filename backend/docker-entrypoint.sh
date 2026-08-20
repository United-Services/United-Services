#!/bin/sh
set -e

echo "[entrypoint] applying database migrations..."
node_modules/.bin/prisma migrate deploy

# Idempotent — only bootstraps a KEK on a genuinely fresh database (no
# KekRegistry rows at all). Re-running `kek:generate` on every container
# start would rotate keys on every deploy, which is not what we want;
# real rotation is a deliberate `npm run kek:generate` invocation, not
# something that happens implicitly on restart.
echo "[entrypoint] checking for an existing KEK..."
KEK_COUNT=$(node -e "
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
prisma.kekRegistry.count().then((c) => { console.log(c); return prisma.\$disconnect(); });
")

if [ "$KEK_COUNT" = "0" ]; then
  echo "[entrypoint] no KEK found — generating the first one..."
  node_modules/.bin/ts-node scripts/kek-generate.ts
else
  echo "[entrypoint] KEK already present ($KEK_COUNT row(s)), skipping generation."
fi

echo "[entrypoint] starting the app..."
exec node dist/main.js

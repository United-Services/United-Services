-- Exactly one KEK may be "active" at a time. Until now that was a
-- convention enforced only by kek-generate.ts's updateMany-then-create
-- transaction at READ COMMITTED — two concurrent runs (two replicas
-- bootstrapping an empty database in the same second) could each see
-- zero rows to demote and each insert an active row, after which
-- getActivePublicKey()'s findFirst returned whichever one Postgres
-- felt like, per query. A partial unique index makes the invariant a
-- database fact rather than a script promise, so the second insert is
-- rejected outright.
--
-- Not CONCURRENTLY: KekRegistry holds a handful of rows for the life of
-- the deployment, so the lock is a few microseconds, and Prisma wraps
-- migrations in a transaction where CONCURRENTLY is not permitted.
CREATE UNIQUE INDEX IF NOT EXISTS "KekRegistry_one_active_idx"
  ON "public"."KekRegistry" ("status")
  WHERE "status" = 'active';

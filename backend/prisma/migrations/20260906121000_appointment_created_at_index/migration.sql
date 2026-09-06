-- The admin bookings list does `ORDER BY "createdAt" DESC LIMIT 1000`
-- with no filter; the existing (clientId, createdAt) composite can't
-- serve that, so every page load sequential-scanned the whole table
-- and top-N sorted it — cost growing with total bookings forever.
-- 20260827124237 added this same index to the other admin-list tables
-- and missed Appointment.
--
-- IF NOT EXISTS, on purpose: on a populated production database this
-- should be created out-of-band first, over DIRECT_URL (session mode),
-- as
--   CREATE INDEX CONCURRENTLY "Appointment_createdAt_idx"
--     ON "public"."Appointment" USING btree ("createdAt");
-- so it takes no write lock, and this migration then records it as a
-- no-op — the pattern 20260828132000_kek_registry_status_index set.
-- (CONCURRENTLY cannot run inside the transaction Prisma wraps each
-- migration in.) On an empty or small database it simply creates it.
CREATE INDEX IF NOT EXISTS "Appointment_createdAt_idx"
  ON "public"."Appointment" USING btree ("createdAt");

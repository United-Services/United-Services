-- CreateIndex
-- Supabase's index advisor flagged KekRegistryService's `status IN (...)`
-- lookup (kek-key-store.service.ts) as a sequential scan. IF NOT EXISTS
-- because this exact index was already applied directly against the
-- database before this migration was written — recorded here so
-- migration history matches reality instead of drifting from it.
CREATE INDEX IF NOT EXISTS "KekRegistry_status_idx" ON "public"."KekRegistry" USING btree ("status");

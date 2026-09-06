-- FileAccessController.create() checked for an existing pending/
-- approved request with a findFirst and then inserted — a read-then-
-- write with no constraint behind it. A double-click (or a retried
-- slow request) raced both past the check, leaving two open requests
-- for the same (client, file): the admin then approved both, producing
-- two audit entries and two download grants for one file, and the
-- admin UI rendered its approve/deny buttons twice. The decide() path
-- in the same file was fixed for exactly this class of race; create()
-- wasn't. Prisma's DSL can't express a partial unique, hence raw SQL.
--
-- Same out-of-band CONCURRENTLY + IF NOT EXISTS pattern as
-- Appointment_createdAt_idx for a populated database.
CREATE UNIQUE INDEX IF NOT EXISTS "FileAccessRequest_client_file_open_key"
  ON "public"."FileAccessRequest" ("clientId", "serviceFileId")
  WHERE "status" IN ('pending', 'approved');

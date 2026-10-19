-- Entries a user created but never put on a shelf were invisible in "My library".
-- Creating now adds a "planned" record (server/records.ensureInLibrary); this backfills the rest.
INSERT INTO "nodinest"."learning_records" ("user_id", "resource_id", "status", "last_accessed_at")
SELECT r."created_by", r."id", 'planned', now()
FROM "nodinest"."resources" r
WHERE r."created_by" IS NOT NULL AND r."deleted_at" IS NULL
ON CONFLICT ("user_id", "resource_id") DO NOTHING;

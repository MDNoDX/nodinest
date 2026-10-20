ALTER TABLE "nodinest"."media_details" ADD COLUMN "publisher_id" uuid;--> statement-breakpoint
ALTER TABLE "nodinest"."publishers" ADD COLUMN "kind" text DEFAULT 'publisher' NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."media_details" ADD CONSTRAINT "media_details_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "nodinest"."publishers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."publishers" ADD CONSTRAINT "publishers_kind_chk" CHECK ("nodinest"."publishers"."kind" IN ('publisher', 'channel', 'podcast', 'website', 'organization'));--> statement-breakpoint
CREATE INDEX "media_details_publisher_idx" ON "nodinest"."media_details" ("publisher_id");
--> statement-breakpoint
-- Existing "where" texts of videos / lectures / podcasts become channel entries.
INSERT INTO "nodinest"."publishers" ("name", "kind", "created_by")
SELECT DISTINCT ON (nodinest.nn_norm(m.channel)) btrim(m.channel),
  CASE WHEN r.type = 'podcast' THEN 'podcast' ELSE 'channel' END, r.created_by
FROM "nodinest"."media_details" m
JOIN "nodinest"."resources" r ON r.id = m.resource_id
WHERE m.channel IS NOT NULL AND btrim(m.channel) <> ''
  AND NOT EXISTS (SELECT 1 FROM "nodinest"."publishers" p
                  WHERE p.deleted_at IS NULL AND nodinest.nn_norm(p.name) = nodinest.nn_norm(m.channel))
ORDER BY nodinest.nn_norm(m.channel), r.created_at;
--> statement-breakpoint
UPDATE "nodinest"."media_details" m SET "publisher_id" = p.id
FROM "nodinest"."publishers" p
WHERE m.channel IS NOT NULL AND p.deleted_at IS NULL
  AND nodinest.nn_norm(p.name) = nodinest.nn_norm(m.channel);

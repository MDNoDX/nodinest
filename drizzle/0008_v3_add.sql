CREATE TABLE "nodinest"."publishers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"country" text,
	"description" text,
	"website_url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nodinest"."writeups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"doc" jsonb NOT NULL,
	"plain" text DEFAULT '' NOT NULL,
	"words" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."people" DROP CONSTRAINT "people_birth_date_chk";--> statement-breakpoint
ALTER TABLE "nodinest"."people" DROP CONSTRAINT "people_death_date_chk";--> statement-breakpoint
ALTER TABLE "nodinest"."resources" DROP CONSTRAINT "resources_pubdate_chk";--> statement-breakpoint
ALTER TABLE "nodinest"."resources" DROP CONSTRAINT "resources_origdate_chk";--> statement-breakpoint
ALTER TABLE "nodinest"."book_details" ADD COLUMN "publisher_id" uuid;--> statement-breakpoint
ALTER TABLE "nodinest"."media_details" ADD COLUMN "lesson_count" integer;--> statement-breakpoint
ALTER TABLE "nodinest"."publishers" ADD CONSTRAINT "publishers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."writeups" ADD CONSTRAINT "writeups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."writeups" ADD CONSTRAINT "writeups_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publishers_updated_idx" ON "nodinest"."publishers" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "writeups_user_resource_uq" ON "nodinest"."writeups" USING btree ("user_id","resource_id");--> statement-breakpoint
ALTER TABLE "nodinest"."book_details" ADD CONSTRAINT "book_details_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "nodinest"."publishers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."people" ADD CONSTRAINT "people_birth_date_chk" CHECK (birth_date IS NULL OR birth_date ~ '^(-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?~?|-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?/-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?)$');--> statement-breakpoint
ALTER TABLE "nodinest"."people" ADD CONSTRAINT "people_death_date_chk" CHECK (death_date IS NULL OR death_date ~ '^(-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?~?|-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?/-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?)$');--> statement-breakpoint
ALTER TABLE "nodinest"."resources" ADD CONSTRAINT "resources_pubdate_chk" CHECK (publication_date IS NULL OR publication_date ~ '^(-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?~?|-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?/-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?)$');--> statement-breakpoint
ALTER TABLE "nodinest"."resources" ADD CONSTRAINT "resources_origdate_chk" CHECK (original_date IS NULL OR original_date ~ '^(-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?~?|-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?/-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?)$');--> statement-breakpoint

-- ─── Publishers: data from the old free-text column ─────────────────────────
INSERT INTO nodinest.publishers (name)
SELECT DISTINCT ON (nodinest.nn_norm(btrim(publisher))) btrim(publisher)
FROM nodinest.book_details
WHERE publisher IS NOT NULL AND btrim(publisher) <> ''
ORDER BY nodinest.nn_norm(btrim(publisher)), btrim(publisher);
--> statement-breakpoint
UPDATE nodinest.book_details b SET publisher_id = p.id
FROM nodinest.publishers p
WHERE b.publisher IS NOT NULL AND nodinest.nn_norm(btrim(b.publisher)) = nodinest.nn_norm(p.name);
--> statement-breakpoint
CREATE UNIQUE INDEX publishers_name_uq ON nodinest.publishers (nodinest.nn_norm(name)) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX publishers_name_trgm_idx ON nodinest.publishers USING gin (nodinest.nn_norm(name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX book_details_publisher_idx ON nodinest.book_details (publisher_id);
--> statement-breakpoint

-- ─── Courses are media-like now (lessons, duration, platform) ───────────────
INSERT INTO nodinest.media_details (resource_id, channel)
SELECT r.id, NULLIF(btrim(b.publisher), '')
FROM nodinest.resources r JOIN nodinest.book_details b ON b.resource_id = r.id
WHERE r.type = 'course'
  AND NOT EXISTS (SELECT 1 FROM nodinest.media_details m WHERE m.resource_id = r.id);
--> statement-breakpoint
DELETE FROM nodinest.book_details b USING nodinest.resources r
WHERE r.id = b.resource_id AND r.type = 'course';
--> statement-breakpoint

-- ─── Konspekt sections → one free-form taqriz document per resource ─────────
WITH nodes AS (
  SELECT s.user_id, s.resource_id, s.position AS pos, s.created_at AS c, 0::bigint AS sub,
    jsonb_build_object('type', 'heading', 'attrs', jsonb_build_object('level', 2),
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', btrim(s.title)))) AS node,
    btrim(s.title) AS txt
  FROM nodinest.conspect_sections s WHERE btrim(s.title) <> ''
  UNION ALL
  SELECT s.user_id, s.resource_id, s.position, s.created_at, l.n,
    jsonb_build_object('type', 'paragraph',
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', l.line))),
    l.line
  FROM nodinest.conspect_sections s,
    LATERAL unnest(string_to_array(s.content, E'\n')) WITH ORDINALITY AS l(line, n)
  WHERE btrim(l.line) <> ''
), docs AS (
  SELECT user_id, resource_id,
    jsonb_build_object('type', 'doc', 'content', jsonb_agg(node ORDER BY pos, c, sub)) AS doc,
    string_agg(txt, E'\n' ORDER BY pos, c, sub) AS plain
  FROM nodes GROUP BY user_id, resource_id
)
INSERT INTO nodinest.writeups (user_id, resource_id, doc, plain, words)
SELECT user_id, resource_id, doc, plain,
  coalesce(array_length(regexp_split_to_array(btrim(plain), '\s+'), 1), 0)
FROM docs;
--> statement-breakpoint

-- ─── RLS ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.publishers, nodinest.writeups TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.publishers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.writeups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.writeups FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY catalog_read ON nodinest.publishers FOR SELECT TO nodinest_app
  USING (nodinest.app_user_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY catalog_write ON nodinest.publishers FOR ALL TO nodinest_app
  USING (nodinest.app_is_superadmin()) WITH CHECK (nodinest.app_is_superadmin());
--> statement-breakpoint
CREATE POLICY catalog_insert_own ON nodinest.publishers FOR INSERT TO nodinest_app
  WITH CHECK (created_by = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY catalog_update_own ON nodinest.publishers FOR UPDATE TO nodinest_app
  USING (created_by = nodinest.app_user_id()) WITH CHECK (created_by = nodinest.app_user_id());
--> statement-breakpoint

-- ─── Search ─────────────────────────────────────────────────────────────────
ALTER TABLE nodinest.writeups ADD COLUMN search tsvector GENERATED ALWAYS AS (
  to_tsvector('simple', nodinest.nn_norm(plain))
) STORED;
--> statement-breakpoint
CREATE INDEX writeups_search_idx ON nodinest.writeups USING gin (search);

CREATE TYPE "nodinest"."text_source_kind" AS ENUM('file', 'url');--> statement-breakpoint
CREATE TYPE "nodinest"."text_source_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
ALTER TYPE "nodinest"."goal_metric" ADD VALUE 'pages';--> statement-breakpoint
CREATE TABLE "nodinest"."book_pages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."book_text_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"kind" "nodinest"."text_source_kind" NOT NULL,
	"file_id" uuid,
	"url" text,
	"status" "nodinest"."text_source_status" DEFAULT 'pending' NOT NULL,
	"pages" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."conspect_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"page_from" integer,
	"page_to" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" DROP CONSTRAINT "learning_records_rating_chk";--> statement-breakpoint
UPDATE "nodinest"."learning_records" SET "rating" = "rating" * 2 WHERE "rating" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."collection_items" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."collections" ADD COLUMN "ranked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodinest"."plans" ADD COLUMN "start_on" date;--> statement-breakpoint
ALTER TABLE "nodinest"."plans" ADD COLUMN "end_on" date;--> statement-breakpoint
ALTER TABLE "nodinest"."resources" ADD COLUMN "original_date" text;--> statement-breakpoint
ALTER TABLE "nodinest"."book_pages" ADD CONSTRAINT "book_pages_source_id_book_text_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "nodinest"."book_text_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."book_pages" ADD CONSTRAINT "book_pages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."book_pages" ADD CONSTRAINT "book_pages_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."book_text_sources" ADD CONSTRAINT "book_text_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."book_text_sources" ADD CONSTRAINT "book_text_sources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."book_text_sources" ADD CONSTRAINT "book_text_sources_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "nodinest"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."conspect_sections" ADD CONSTRAINT "conspect_sections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."conspect_sections" ADD CONSTRAINT "conspect_sections_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "book_pages_source_page_idx" ON "nodinest"."book_pages" USING btree ("source_id","page");--> statement-breakpoint
CREATE INDEX "book_pages_user_resource_idx" ON "nodinest"."book_pages" USING btree ("user_id","resource_id");--> statement-breakpoint
CREATE INDEX "book_text_sources_user_resource_idx" ON "nodinest"."book_text_sources" USING btree ("user_id","resource_id");--> statement-breakpoint
CREATE INDEX "conspect_user_resource_idx" ON "nodinest"."conspect_sections" USING btree ("user_id","resource_id","position");--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" ADD CONSTRAINT "learning_records_rating_chk" CHECK ("nodinest"."learning_records"."rating" IS NULL OR "nodinest"."learning_records"."rating" BETWEEN 1 AND 10);--> statement-breakpoint
ALTER TABLE "nodinest"."resources" ADD CONSTRAINT "resources_origdate_chk" CHECK (original_date IS NULL OR original_date ~ '^-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$');--> statement-breakpoint
-- Data migration (v2): dates → timestamps (noon, Tashkent), plans, statuses.
UPDATE "nodinest"."learning_records" SET "started_at" = ("started_on"::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Tashkent' WHERE "started_on" IS NOT NULL AND "started_at" IS NULL;--> statement-breakpoint
UPDATE "nodinest"."learning_records" SET "completed_at" = ("completed_on"::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Tashkent' WHERE "completed_on" IS NOT NULL AND "completed_at" IS NULL;--> statement-breakpoint
UPDATE "nodinest"."learning_records" SET "status" = 'paused' WHERE "status" = 'abandoned';--> statement-breakpoint
UPDATE "nodinest"."plans" SET "start_on" = "planned_on", "end_on" = "planned_on" WHERE "planned_on" IS NOT NULL;--> statement-breakpoint
UPDATE "nodinest"."collection_items" ci SET "position" = sub.rn FROM (SELECT id, row_number() OVER (PARTITION BY collection_id ORDER BY created_at) AS rn FROM "nodinest"."collection_items") sub WHERE ci.id = sub.id;

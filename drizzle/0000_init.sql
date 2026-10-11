CREATE SCHEMA "nodinest";
--> statement-breakpoint
CREATE TYPE "nodinest"."ai_action_status" AS ENUM('proposed', 'completed', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "nodinest"."ai_message_role" AS ENUM('user', 'model');--> statement-breakpoint
CREATE TYPE "nodinest"."contributor_role" AS ENUM('author', 'editor', 'translator', 'speaker', 'host', 'guest', 'instructor', 'narrator', 'illustrator', 'other');--> statement-breakpoint
CREATE TYPE "nodinest"."file_purpose" AS ENUM('cover', 'portrait', 'attachment');--> statement-breakpoint
CREATE TYPE "nodinest"."goal_metric" AS ENUM('minutes', 'sessions', 'completed_resources');--> statement-breakpoint
CREATE TYPE "nodinest"."goal_period" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "nodinest"."goal_status" AS ENUM('active', 'achieved', 'archived');--> statement-breakpoint
CREATE TYPE "nodinest"."identifier_scheme" AS ENUM('isbn13', 'isbn10', 'doi', 'youtube', 'wikidata', 'openlibrary', 'other');--> statement-breakpoint
CREATE TYPE "nodinest"."learning_status" AS ENUM('planned', 'in_progress', 'completed', 'paused', 'abandoned');--> statement-breakpoint
CREATE TYPE "nodinest"."link_kind" AS ENUM('source', 'reference', 'official', 'read', 'purchase', 'social', 'other');--> statement-breakpoint
CREATE TYPE "nodinest"."note_kind" AS ENUM('note', 'quote');--> statement-breakpoint
CREATE TYPE "nodinest"."progress_unit" AS ENUM('pages', 'chapters', 'minutes', 'percent', 'lessons');--> statement-breakpoint
CREATE TYPE "nodinest"."relation_kind" AS ENUM('edition_of', 'translation_of', 'part_of', 'related');--> statement-breakpoint
CREATE TYPE "nodinest"."resource_type" AS ENUM('book', 'course', 'video', 'lecture', 'interview', 'article', 'podcast', 'other');--> statement-breakpoint
CREATE TYPE "nodinest"."session_source" AS ENUM('timer', 'manual');--> statement-breakpoint
CREATE TYPE "nodinest"."session_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "nodinest"."suggestion_op" AS ENUM('create', 'update', 'archive');--> statement-breakpoint
CREATE TYPE "nodinest"."suggestion_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "nodinest"."suggestion_target" AS ENUM('person', 'resource');--> statement-breakpoint
CREATE TYPE "nodinest"."user_role" AS ENUM('user', 'superadmin');--> statement-breakpoint
CREATE TYPE "nodinest"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "nodinest"."verification_status" AS ENUM('unverified', 'verified', 'disputed');--> statement-breakpoint
CREATE TYPE "nodinest"."visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE "nodinest"."account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."ai_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"tool" text NOT NULL,
	"args" jsonb NOT NULL,
	"status" "nodinest"."ai_action_status" DEFAULT 'proposed' NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nodinest"."ai_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "nodinest"."ai_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."book_details" (
	"resource_id" uuid PRIMARY KEY NOT NULL,
	"publisher" text,
	"edition" text,
	"page_count" integer,
	"original_language" text,
	"table_of_contents" text,
	"reading_url" text,
	"purchase_url" text,
	"attachment_file_id" uuid
);
--> statement-breakpoint
CREATE TABLE "nodinest"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_uz" text NOT NULL,
	"name_en" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."collection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid,
	"note_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_one_target_chk" CHECK (num_nonnulls("nodinest"."collection_items"."resource_id", "nodinest"."collection_items"."note_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "nodinest"."collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"system_key" text,
	"name" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_name_chk" CHECK ("nodinest"."collections"."name" IS NOT NULL OR "nodinest"."collections"."system_key" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "nodinest"."files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"purpose" "nodinest"."file_purpose" NOT NULL,
	"is_catalog" boolean DEFAULT false NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nodinest"."goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"metric" "nodinest"."goal_metric" NOT NULL,
	"period" "nodinest"."goal_period" NOT NULL,
	"target" integer NOT NULL,
	"resource_type" "nodinest"."resource_type",
	"status" "nodinest"."goal_status" DEFAULT 'active' NOT NULL,
	"note" text,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_target_chk" CHECK ("nodinest"."goals"."target" > 0)
);
--> statement-breakpoint
CREATE TABLE "nodinest"."learning_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"status" "nodinest"."learning_status" DEFAULT 'planned' NOT NULL,
	"started_on" date,
	"completed_on" date,
	"rating" smallint,
	"review" text,
	"learning_goals" text,
	"personal_notes" text,
	"progress_current" integer,
	"progress_total" integer,
	"progress_unit" "nodinest"."progress_unit" DEFAULT 'pages' NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_records_rating_chk" CHECK ("nodinest"."learning_records"."rating" IS NULL OR "nodinest"."learning_records"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "learning_records_progress_chk" CHECK (("nodinest"."learning_records"."progress_current" IS NULL OR "nodinest"."learning_records"."progress_current" >= 0) AND ("nodinest"."learning_records"."progress_total" IS NULL OR "nodinest"."learning_records"."progress_total" > 0))
);
--> statement-breakpoint
CREATE TABLE "nodinest"."media_details" (
	"resource_id" uuid PRIMARY KEY NOT NULL,
	"platform" text,
	"channel" text,
	"duration_seconds" integer,
	"transcript" text,
	"transcript_url" text
);
--> statement-breakpoint
CREATE TABLE "nodinest"."note_tags" (
	"note_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "note_tags_note_id_tag_id_pk" PRIMARY KEY("note_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "nodinest"."note_kind" DEFAULT 'note' NOT NULL,
	"title" text,
	"body" text,
	"quote_text" text,
	"resource_id" uuid,
	"person_id" uuid,
	"session_id" uuid,
	"page_from" integer,
	"page_to" integer,
	"location" text,
	"timestamp_seconds" integer,
	"visibility" "nodinest"."visibility" DEFAULT 'private' NOT NULL,
	"verification" "nodinest"."verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "notes_quote_text_chk" CHECK ("nodinest"."notes"."kind" <> 'quote' OR ("nodinest"."notes"."quote_text" IS NOT NULL AND length(btrim("nodinest"."notes"."quote_text")) > 0)),
	CONSTRAINT "notes_pages_chk" CHECK ("nodinest"."notes"."page_to" IS NULL OR "nodinest"."notes"."page_from" IS NULL OR "nodinest"."notes"."page_to" >= "nodinest"."notes"."page_from")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"short_description" text,
	"biography" text,
	"birth_date" text,
	"death_date" text,
	"nationality" text,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"activity_areas" text,
	"portrait_url" text,
	"portrait_file_id" uuid,
	"website_url" text,
	"verification" "nodinest"."verification_status" DEFAULT 'unverified' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "people_birth_date_chk" CHECK (birth_date IS NULL OR birth_date ~ '^-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$'),
	CONSTRAINT "people_death_date_chk" CHECK (death_date IS NULL OR death_date ~ '^-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$')
);
--> statement-breakpoint
CREATE TABLE "nodinest"."person_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."person_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "nodinest"."link_kind" DEFAULT 'reference' NOT NULL,
	"url" text NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "nodinest"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"resource_id" uuid,
	"planned_on" date,
	"planned_minutes" integer,
	"done" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."resource_categories" (
	"resource_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "resource_categories_resource_id_category_id_pk" PRIMARY KEY("resource_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."resource_contributors" (
	"resource_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "nodinest"."contributor_role" DEFAULT 'author' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "resource_contributors_resource_id_person_id_role_pk" PRIMARY KEY("resource_id","person_id","role")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."resource_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"scheme" "nodinest"."identifier_scheme" NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."resource_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"kind" "nodinest"."link_kind" DEFAULT 'reference' NOT NULL,
	"url" text NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "nodinest"."resource_relations" (
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"kind" "nodinest"."relation_kind" NOT NULL,
	CONSTRAINT "resource_relations_from_id_to_id_kind_pk" PRIMARY KEY("from_id","to_id","kind"),
	CONSTRAINT "relations_no_self_chk" CHECK ("nodinest"."resource_relations"."from_id" <> "nodinest"."resource_relations"."to_id")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."resource_tags" (
	"resource_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "resource_tags_resource_id_tag_id_pk" PRIMARY KEY("resource_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "nodinest"."resource_type" NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"description" text,
	"cover_url" text,
	"cover_file_id" uuid,
	"language" text,
	"publication_date" text,
	"source_url" text,
	"verification" "nodinest"."verification_status" DEFAULT 'unverified' NOT NULL,
	"source_note" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "resources_pubdate_chk" CHECK (publication_date IS NULL OR publication_date ~ '^-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$')
);
--> statement-breakpoint
CREATE TABLE "nodinest"."session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid,
	"status" "nodinest"."session_status" NOT NULL,
	"source" "nodinest"."session_source" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"last_resumed_at" timestamp with time zone,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"progress_from" integer,
	"progress_to" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "study_sessions_active_nonneg_chk" CHECK ("nodinest"."study_sessions"."active_seconds" >= 0),
	CONSTRAINT "study_sessions_end_chk" CHECK ("nodinest"."study_sessions"."ended_at" IS NULL OR "nodinest"."study_sessions"."ended_at" >= "nodinest"."study_sessions"."started_at"),
	CONSTRAINT "study_sessions_completed_chk" CHECK ("nodinest"."study_sessions"."status" <> 'completed' OR ("nodinest"."study_sessions"."ended_at" IS NOT NULL AND "nodinest"."study_sessions"."last_resumed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "nodinest"."suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation" "nodinest"."suggestion_op" NOT NULL,
	"target_type" "nodinest"."suggestion_target" NOT NULL,
	"target_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"base_snapshot" jsonb,
	"explanation" text,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "nodinest"."suggestion_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"applied_target_id" uuid,
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_target_chk" CHECK ("nodinest"."suggestions"."operation" = 'create' OR "nodinest"."suggestions"."target_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "nodinest"."tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"normalized" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_owner_norm_uq" UNIQUE NULLS NOT DISTINCT("owner_id","normalized")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "nodinest"."user_role" DEFAULT 'user' NOT NULL,
	"status" "nodinest"."user_status" DEFAULT 'active' NOT NULL,
	"locale" text DEFAULT 'uz' NOT NULL,
	"timezone" text DEFAULT 'Asia/Tashkent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."ai_actions" ADD CONSTRAINT "ai_actions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."ai_actions" ADD CONSTRAINT "ai_actions_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "nodinest"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "nodinest"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."ai_messages" ADD CONSTRAINT "ai_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."book_details" ADD CONSTRAINT "book_details_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."book_details" ADD CONSTRAINT "book_details_attachment_file_id_files_id_fk" FOREIGN KEY ("attachment_file_id") REFERENCES "nodinest"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."categories" ADD CONSTRAINT "categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "nodinest"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "nodinest"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."collection_items" ADD CONSTRAINT "collection_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."collection_items" ADD CONSTRAINT "collection_items_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."collection_items" ADD CONSTRAINT "collection_items_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "nodinest"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."collections" ADD CONSTRAINT "collections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."files" ADD CONSTRAINT "files_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."goals" ADD CONSTRAINT "goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" ADD CONSTRAINT "learning_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" ADD CONSTRAINT "learning_records_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."media_details" ADD CONSTRAINT "media_details_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."note_tags" ADD CONSTRAINT "note_tags_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "nodinest"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."note_tags" ADD CONSTRAINT "note_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "nodinest"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."notes" ADD CONSTRAINT "notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."notes" ADD CONSTRAINT "notes_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."notes" ADD CONSTRAINT "notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "nodinest"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."notes" ADD CONSTRAINT "notes_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "nodinest"."study_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."people" ADD CONSTRAINT "people_portrait_file_id_files_id_fk" FOREIGN KEY ("portrait_file_id") REFERENCES "nodinest"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."people" ADD CONSTRAINT "people_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."people" ADD CONSTRAINT "people_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."person_aliases" ADD CONSTRAINT "person_aliases_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "nodinest"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."person_links" ADD CONSTRAINT "person_links_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "nodinest"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."plans" ADD CONSTRAINT "plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."plans" ADD CONSTRAINT "plans_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_categories" ADD CONSTRAINT "resource_categories_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_categories" ADD CONSTRAINT "resource_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "nodinest"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_contributors" ADD CONSTRAINT "resource_contributors_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_contributors" ADD CONSTRAINT "resource_contributors_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "nodinest"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_identifiers" ADD CONSTRAINT "resource_identifiers_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_links" ADD CONSTRAINT "resource_links_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_relations" ADD CONSTRAINT "resource_relations_from_id_resources_id_fk" FOREIGN KEY ("from_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_relations" ADD CONSTRAINT "resource_relations_to_id_resources_id_fk" FOREIGN KEY ("to_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_tags" ADD CONSTRAINT "resource_tags_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resource_tags" ADD CONSTRAINT "resource_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "nodinest"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resources" ADD CONSTRAINT "resources_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "nodinest"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resources" ADD CONSTRAINT "resources_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resources" ADD CONSTRAINT "resources_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."study_sessions" ADD CONSTRAINT "study_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."study_sessions" ADD CONSTRAINT "study_sessions_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."suggestions" ADD CONSTRAINT "suggestions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."suggestions" ADD CONSTRAINT "suggestions_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."tags" ADD CONSTRAINT "tags_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "nodinest"."account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_uq" ON "nodinest"."account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "ai_actions_user_idx" ON "nodinest"."ai_actions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_idx" ON "nodinest"."ai_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_messages_conv_idx" ON "nodinest"."ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "nodinest"."audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "nodinest"."audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "nodinest"."categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_items_resource_uq" ON "nodinest"."collection_items" USING btree ("collection_id","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_items_note_uq" ON "nodinest"."collection_items" USING btree ("collection_id","note_id");--> statement-breakpoint
CREATE INDEX "collections_user_idx" ON "nodinest"."collections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_user_system_uq" ON "nodinest"."collections" USING btree ("user_id","system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "files_path_uq" ON "nodinest"."files" USING btree ("bucket","path");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "nodinest"."files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "nodinest"."goals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_records_user_resource_uq" ON "nodinest"."learning_records" USING btree ("user_id","resource_id");--> statement-breakpoint
CREATE INDEX "learning_records_user_status_idx" ON "nodinest"."learning_records" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "note_tags_tag_idx" ON "nodinest"."note_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "notes_user_created_idx" ON "nodinest"."notes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notes_resource_idx" ON "nodinest"."notes" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "people_updated_idx" ON "nodinest"."people" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "person_aliases_person_idx" ON "nodinest"."person_aliases" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_links_person_idx" ON "nodinest"."person_links" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "plans_user_date_idx" ON "nodinest"."plans" USING btree ("user_id","planned_on");--> statement-breakpoint
CREATE INDEX "resource_categories_cat_idx" ON "nodinest"."resource_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "contributors_person_idx" ON "nodinest"."resource_contributors" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identifiers_scheme_value_uq" ON "nodinest"."resource_identifiers" USING btree ("scheme","value");--> statement-breakpoint
CREATE INDEX "identifiers_resource_idx" ON "nodinest"."resource_identifiers" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "resource_links_resource_idx" ON "nodinest"."resource_links" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "relations_to_idx" ON "nodinest"."resource_relations" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "resource_tags_tag_idx" ON "nodinest"."resource_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "resources_type_idx" ON "nodinest"."resources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "resources_updated_idx" ON "nodinest"."resources" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "nodinest"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_sessions_user_started_idx" ON "nodinest"."study_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "study_sessions_resource_idx" ON "nodinest"."study_sessions" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_sessions_one_open_uq" ON "nodinest"."study_sessions" USING btree ("user_id") WHERE "nodinest"."study_sessions"."status" <> 'completed' AND "nodinest"."study_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "suggestions_status_idx" ON "nodinest"."suggestions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "suggestions_user_idx" ON "nodinest"."suggestions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uq" ON "nodinest"."user" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "nodinest"."verification" USING btree ("identifier");
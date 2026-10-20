CREATE TABLE "nodinest"."transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"source" jsonb NOT NULL,
	"mode" text NOT NULL,
	"deep" boolean DEFAULT true NOT NULL,
	"duration_seconds" integer NOT NULL,
	"brief" jsonb,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text" text,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"gemini_file" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_mode_chk" CHECK ("nodinest"."transcripts"."mode" IN ('transcript', 'notes')),
	CONSTRAINT "transcripts_status_chk" CHECK ("nodinest"."transcripts"."status" IN ('running', 'done', 'error'))
);
--> statement-breakpoint
ALTER TABLE "nodinest"."transcripts" ADD CONSTRAINT "transcripts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."transcripts" ADD CONSTRAINT "transcripts_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcripts_user_resource_idx" ON "nodinest"."transcripts" USING btree ("user_id","resource_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.transcripts TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.transcripts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.transcripts FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());

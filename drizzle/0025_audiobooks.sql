CREATE TABLE "nodinest"."audiobook_scripts" (
	"audiobook_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"script" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audiobook_scripts_audiobook_id_idx_pk" PRIMARY KEY("audiobook_id","idx")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."audiobooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"file_id" uuid,
	"status" text DEFAULT 'analyzing' NOT NULL,
	"error" text,
	"analysis" jsonb,
	"plan" jsonb,
	"scanned" boolean DEFAULT false NOT NULL,
	"position_idx" integer DEFAULT 0 NOT NULL,
	"position_sec" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."audiobook_scripts" ADD CONSTRAINT "audiobook_scripts_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "nodinest"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."audiobook_scripts" ADD CONSTRAINT "audiobook_scripts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."audiobooks" ADD CONSTRAINT "audiobooks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."audiobooks" ADD CONSTRAINT "audiobooks_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."audiobooks" ADD CONSTRAINT "audiobooks_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "nodinest"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audiobooks_user_resource_uq" ON "nodinest"."audiobooks" USING btree ("user_id","resource_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.audiobooks TO nodinest_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.audiobook_scripts TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.audiobooks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.audiobook_scripts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.audiobooks FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.audiobook_scripts FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());

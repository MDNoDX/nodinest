CREATE TABLE "nodinest"."resume_points" (
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"media" jsonb,
	"media_seconds" integer,
	"doc_pos" integer,
	"doc_anchor" text,
	"place" text DEFAULT 'taqriz' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_points_user_id_resource_id_pk" PRIMARY KEY("user_id","resource_id")
);
--> statement-breakpoint
ALTER TABLE "nodinest"."resume_points" ADD CONSTRAINT "resume_points_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."resume_points" ADD CONSTRAINT "resume_points_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_points_user_updated_idx" ON "nodinest"."resume_points" USING btree ("user_id","updated_at");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.resume_points TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.resume_points ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.resume_points FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());

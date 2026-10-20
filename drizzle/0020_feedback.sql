CREATE TABLE "nodinest"."feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"contact" text,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_status_chk" CHECK ("nodinest"."feedback"."status" IN ('new', 'read', 'done'))
);
--> statement-breakpoint
ALTER TABLE "nodinest"."feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_status_created_idx" ON "nodinest"."feedback" USING btree ("status","created_at");--> statement-breakpoint
GRANT SELECT, INSERT ON nodinest.feedback TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.feedback ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Users write and read their own messages; the admin reads them through the
-- owner connection after the role check (server/feedback.ts).
CREATE POLICY owner_rw ON nodinest.feedback FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());

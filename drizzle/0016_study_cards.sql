CREATE TABLE "nodinest"."study_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid,
	"deck" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"explanation" text,
	"source" text,
	"kind" text DEFAULT 'recall' NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"interval_days" real DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."study_cards" ADD CONSTRAINT "study_cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."study_cards" ADD CONSTRAINT "study_cards_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_cards_user_due_idx" ON "nodinest"."study_cards" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "study_cards_user_deck_idx" ON "nodinest"."study_cards" USING btree ("user_id","deck");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.study_cards TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.study_cards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.study_cards FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());

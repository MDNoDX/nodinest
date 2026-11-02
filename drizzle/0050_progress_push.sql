CREATE TABLE "nodinest"."job_progress" (
	"key" text PRIMARY KEY NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "nodinest"."push_subscriptions" USING btree ("user_id");--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON nodinest.push_subscriptions TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.push_subscriptions FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());

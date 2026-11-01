CREATE TABLE "nodinest"."follow_requests" (
	"requester_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_requests_requester_id_target_id_pk" PRIMARY KEY("requester_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_id" uuid,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."user" ALTER COLUMN "profile_public" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "notify" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."follow_requests" ADD CONSTRAINT "follow_requests_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."follow_requests" ADD CONSTRAINT "follow_requests_target_id_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."notifications" ADD CONSTRAINT "notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_requests_target_idx" ON "nodinest"."follow_requests" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "nodinest"."notifications" USING btree ("user_id","created_at");--> statement-breakpoint
GRANT SELECT (notify), UPDATE (notify) ON nodinest."user" TO nodinest_app;
--> statement-breakpoint
GRANT SELECT, UPDATE, DELETE ON nodinest.notifications TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.notifications FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
ALTER TABLE nodinest.follow_requests ENABLE ROW LEVEL SECURITY;

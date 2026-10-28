CREATE TABLE "nodinest"."follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "follows_not_self" CHECK ("nodinest"."follows"."follower_id" <> "nodinest"."follows"."followee_id")
);
--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "profile_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "nodinest"."follows" ADD CONSTRAINT "follows_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."follows" ADD CONSTRAINT "follows_followee_id_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "nodinest"."follows" USING btree ("followee_id");--> statement-breakpoint
ALTER TABLE nodinest.follows ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.learning_records ADD CONSTRAINT learning_records_visibility_chk CHECK (visibility IN ('private', 'public'));
--> statement-breakpoint
GRANT SELECT (profile_public, bio) ON nodinest."user" TO nodinest_app;
--> statement-breakpoint
GRANT UPDATE (profile_public, bio) ON nodinest."user" TO nodinest_app;

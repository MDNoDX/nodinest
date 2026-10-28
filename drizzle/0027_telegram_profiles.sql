CREATE TABLE "nodinest"."bot_users" (
	"tg_id" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"first_name" text,
	"language" text,
	"user_id" uuid,
	"awaiting" text,
	"blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."telegram_logins" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"browser_hash" text NOT NULL,
	"device" text,
	"tg_user" jsonb,
	"approved_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."tg_posts" (
	"message_id" bigint PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"feedback_id" uuid,
	"tg_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."feedback" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."feedback" ADD COLUMN "source" text DEFAULT 'site' NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."feedback" ADD COLUMN "tg_id" bigint;--> statement-breakpoint
ALTER TABLE "nodinest"."feedback" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "nodinest"."feedback" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "nodinest"."bot_users" ADD CONSTRAINT "bot_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."tg_posts" ADD CONSTRAINT "tg_posts_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "nodinest"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_users_user_idx" ON "nodinest"."bot_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_uq" ON "nodinest"."user" USING btree (lower("username"));--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD CONSTRAINT "user_username_chk" CHECK ("nodinest"."user"."username" IS NULL OR "nodinest"."user"."username" ~ '^[a-z][a-z0-9_]{2,29}$');--> statement-breakpoint
-- Existing accounts: first / last name from the display name (last word = surname).
UPDATE nodinest."user" SET
  first_name = CASE WHEN position(' ' in btrim(name)) > 0
    THEN btrim(regexp_replace(btrim(name), '\s+\S+$', '')) ELSE btrim(name) END,
  last_name = CASE WHEN position(' ' in btrim(name)) > 0
    THEN substring(btrim(name) from '\S+$') ELSE NULL END
WHERE first_name IS NULL;
--> statement-breakpoint
-- Bot / login tables are used only by the server's owner connection.
ALTER TABLE nodinest.bot_users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.telegram_logins ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.tg_posts ENABLE ROW LEVEL SECURITY;

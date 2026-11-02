CREATE TABLE "nodinest"."post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text,
	"gif" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "post_comments_body_len" CHECK (char_length("nodinest"."post_comments"."body") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "nodinest"."post_likes" (
	"record_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_record_id_user_id_pk" PRIMARY KEY("record_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "nodinest"."dm_messages" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_threads" ADD COLUMN "a_cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_threads" ADD COLUMN "b_cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" ADD COLUMN "text_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "show_online" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."post_comments" ADD CONSTRAINT "post_comments_record_id_learning_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "nodinest"."learning_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."post_comments" ADD CONSTRAINT "post_comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."post_likes" ADD CONSTRAINT "post_likes_record_id_learning_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "nodinest"."learning_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."post_likes" ADD CONSTRAINT "post_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_comments_record_idx" ON "nodinest"."post_comments" USING btree ("record_id","created_at");--> statement-breakpoint
CREATE INDEX "post_likes_user_idx" ON "nodinest"."post_likes" USING btree ("user_id");--> statement-breakpoint
GRANT SELECT (show_online, last_seen_at), UPDATE (show_online) ON nodinest."user" TO nodinest_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON nodinest.post_likes TO nodinest_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON nodinest.post_comments TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.post_likes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.post_comments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Reading is checked in the queries (only posts one may see); writing only as oneself.
CREATE POLICY read_all ON nodinest.post_likes FOR SELECT TO nodinest_app USING (true);
--> statement-breakpoint
CREATE POLICY own_write ON nodinest.post_likes FOR INSERT TO nodinest_app
  WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY own_delete ON nodinest.post_likes FOR DELETE TO nodinest_app
  USING (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY read_all ON nodinest.post_comments FOR SELECT TO nodinest_app USING (true);
--> statement-breakpoint
CREATE POLICY own_write ON nodinest.post_comments FOR INSERT TO nodinest_app
  WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
-- A comment is removed by its writer or by the post's owner.
CREATE POLICY own_or_post_owner ON nodinest.post_comments FOR UPDATE TO nodinest_app
  USING (user_id = nodinest.app_user_id() OR EXISTS (SELECT 1 FROM nodinest.learning_records lr
    WHERE lr.id = record_id AND lr.user_id = nodinest.app_user_id()));
--> statement-breakpoint
GRANT DELETE ON nodinest.dm_messages TO nodinest_app;
--> statement-breakpoint
CREATE POLICY member_delete ON nodinest.dm_messages FOR DELETE TO nodinest_app
  USING (EXISTS (SELECT 1 FROM nodinest.dm_threads t WHERE t.id = thread_id
    AND nodinest.app_user_id() IN (t.a_id, t.b_id)));

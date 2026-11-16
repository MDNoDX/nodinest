CREATE TABLE "nodinest"."comment_likes" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_likes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "nodinest"."post_comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "nodinest"."post_comments" ADD COLUMN "reply_to_id" uuid;--> statement-breakpoint
ALTER TABLE "nodinest"."comment_likes" ADD CONSTRAINT "comment_likes_comment_id_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "nodinest"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."comment_likes" ADD CONSTRAINT "comment_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_likes_user_idx" ON "nodinest"."comment_likes" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "nodinest"."post_comments" ADD CONSTRAINT "post_comments_parent_id_post_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "nodinest"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."post_comments" ADD CONSTRAINT "post_comments_reply_to_id_post_comments_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "nodinest"."post_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_comments_parent_idx" ON "nodinest"."post_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "post_comments_user_idx" ON "nodinest"."post_comments" USING btree ("user_id","created_at");--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON nodinest.comment_likes TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.comment_likes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Like post_likes: reading is checked in the queries (only posts one may see), writing only as oneself.
CREATE POLICY read_all ON nodinest.comment_likes FOR SELECT TO nodinest_app USING (true);
--> statement-breakpoint
CREATE POLICY own_write ON nodinest.comment_likes FOR INSERT TO nodinest_app
  WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY own_delete ON nodinest.comment_likes FOR DELETE TO nodinest_app
  USING (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE INDEX "post_likes_user_time_idx" ON "nodinest"."post_likes" USING btree ("user_id","created_at");

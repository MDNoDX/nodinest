CREATE TABLE "nodinest"."dm_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text,
	"file_id" uuid,
	"resource_id" uuid,
	"reply_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "dm_messages_body_len" CHECK (char_length("nodinest"."dm_messages"."body") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "nodinest"."dm_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	"a_read_at" timestamp with time zone,
	"b_read_at" timestamp with time zone,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_threads_order" CHECK ("nodinest"."dm_threads"."a_id" < "nodinest"."dm_threads"."b_id")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
ALTER TABLE "nodinest"."dm_messages" ADD CONSTRAINT "dm_messages_thread_id_dm_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "nodinest"."dm_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_messages" ADD CONSTRAINT "dm_messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_messages" ADD CONSTRAINT "dm_messages_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "nodinest"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_messages" ADD CONSTRAINT "dm_messages_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_threads" ADD CONSTRAINT "dm_threads_a_id_user_id_fk" FOREIGN KEY ("a_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_threads" ADD CONSTRAINT "dm_threads_b_id_user_id_fk" FOREIGN KEY ("b_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dm_messages_thread_idx" ON "nodinest"."dm_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "dm_messages_file_idx" ON "nodinest"."dm_messages" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_threads_pair_uq" ON "nodinest"."dm_threads" USING btree ("a_id","b_id");--> statement-breakpoint
CREATE INDEX "dm_threads_a_idx" ON "nodinest"."dm_threads" USING btree ("a_id","last_at");--> statement-breakpoint
CREATE INDEX "dm_threads_b_idx" ON "nodinest"."dm_threads" USING btree ("b_id","last_at");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "nodinest"."user_blocks" USING btree ("blocked_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON nodinest.dm_threads, nodinest.dm_messages TO nodinest_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON nodinest.user_blocks TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.dm_threads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.dm_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.user_blocks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Only the two people in a conversation see it; nobody else, the admin included.
CREATE POLICY member_rw ON nodinest.dm_threads FOR ALL TO nodinest_app
  USING (nodinest.app_user_id() IN (a_id, b_id))
  WITH CHECK (nodinest.app_user_id() IN (a_id, b_id));
--> statement-breakpoint
CREATE POLICY member_read ON nodinest.dm_messages FOR SELECT TO nodinest_app
  USING (EXISTS (SELECT 1 FROM nodinest.dm_threads t WHERE t.id = thread_id
    AND nodinest.app_user_id() IN (t.a_id, t.b_id)));
--> statement-breakpoint
CREATE POLICY sender_write ON nodinest.dm_messages FOR INSERT TO nodinest_app
  WITH CHECK (sender_id = nodinest.app_user_id() AND EXISTS (SELECT 1 FROM nodinest.dm_threads t
    WHERE t.id = thread_id AND nodinest.app_user_id() IN (t.a_id, t.b_id)));
--> statement-breakpoint
CREATE POLICY sender_update ON nodinest.dm_messages FOR UPDATE TO nodinest_app
  USING (sender_id = nodinest.app_user_id()) WITH CHECK (sender_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.user_blocks FOR ALL TO nodinest_app
  USING (blocker_id = nodinest.app_user_id()) WITH CHECK (blocker_id = nodinest.app_user_id());

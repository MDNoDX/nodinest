CREATE TABLE "nodinest"."dm_reactions" (
	"message_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_reactions_message_id_user_id_pk" PRIMARY KEY("message_id","user_id"),
	CONSTRAINT "dm_reactions_emoji_len" CHECK (char_length("nodinest"."dm_reactions"."emoji") between 1 and 16)
);
--> statement-breakpoint
ALTER TABLE "nodinest"."dm_threads" ADD COLUMN "reacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_reactions" ADD CONSTRAINT "dm_reactions_message_id_dm_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "nodinest"."dm_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_reactions" ADD CONSTRAINT "dm_reactions_thread_id_dm_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "nodinest"."dm_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_reactions" ADD CONSTRAINT "dm_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dm_reactions_thread_idx" ON "nodinest"."dm_reactions" USING btree ("thread_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.dm_reactions TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.dm_reactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Both members see the reactions; each one sets and takes back only their own.
CREATE POLICY member_read ON nodinest.dm_reactions FOR SELECT TO nodinest_app
  USING (EXISTS (SELECT 1 FROM nodinest.dm_threads t WHERE t.id = thread_id
    AND nodinest.app_user_id() IN (t.a_id, t.b_id)));
--> statement-breakpoint
CREATE POLICY own_write ON nodinest.dm_reactions FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id())
  WITH CHECK (user_id = nodinest.app_user_id() AND EXISTS (SELECT 1 FROM nodinest.dm_threads t
    WHERE t.id = thread_id AND nodinest.app_user_id() IN (t.a_id, t.b_id)));

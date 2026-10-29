CREATE TABLE "nodinest"."ai_memory" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"memory" jsonb NOT NULL,
	"pending" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."ai_memory" ADD CONSTRAINT "ai_memory_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "nodinest"."ai_memory" ENABLE ROW LEVEL SECURITY;
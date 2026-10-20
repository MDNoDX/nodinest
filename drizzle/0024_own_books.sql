CREATE TABLE "nodinest"."own_books" (
	"resource_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"template" text DEFAULT 'blank' NOT NULL,
	"goal_words" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."own_books" ADD CONSTRAINT "own_books_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "nodinest"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."own_books" ADD CONSTRAINT "own_books_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "own_books_user_idx" ON "nodinest"."own_books" USING btree ("user_id","updated_at");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.own_books TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.own_books ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.own_books FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());

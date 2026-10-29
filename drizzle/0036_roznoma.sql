CREATE TYPE "nodinest"."routine_repeat" AS ENUM('daily', 'weekly', 'once');--> statement-breakpoint
ALTER TYPE "nodinest"."goal_metric" ADD VALUE 'steps';--> statement-breakpoint
CREATE TABLE "nodinest"."day_logs" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"motto" text,
	"title" text,
	"story" text,
	"highlights" text[] DEFAULT '{}'::text[] NOT NULL,
	"lesson" text,
	"productive_minutes" integer,
	"better" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_logs_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."goal_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."routine_checks" (
	"routine_id" uuid NOT NULL,
	"day" date NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_checks_routine_id_day_pk" PRIMARY KEY("routine_id","day")
);
--> statement-breakpoint
CREATE TABLE "nodinest"."routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"amount" text,
	"time" text,
	"repeat" "nodinest"."routine_repeat" DEFAULT 'daily' NOT NULL,
	"weekdays" integer[] DEFAULT '{}'::int[] NOT NULL,
	"on_day" date,
	"position" integer DEFAULT 0 NOT NULL,
	"alarm" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."day_logs" ADD CONSTRAINT "day_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."goal_steps" ADD CONSTRAINT "goal_steps_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "nodinest"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."goal_steps" ADD CONSTRAINT "goal_steps_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."routine_checks" ADD CONSTRAINT "routine_checks_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "nodinest"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."routine_checks" ADD CONSTRAINT "routine_checks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD CONSTRAINT "routines_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_steps_goal_idx" ON "nodinest"."goal_steps" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "routine_checks_user_day_idx" ON "nodinest"."routine_checks" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "routines_user_idx" ON "nodinest"."routines" USING btree ("user_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.goal_steps, nodinest.routines, nodinest.routine_checks, nodinest.day_logs TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.goal_steps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.routines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.routine_checks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.day_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.goal_steps FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.routines FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.routine_checks FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.day_logs FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
-- Old one-off plans become one-day items of the Röznoma.
INSERT INTO nodinest.routines (user_id, title, repeat, on_day, position, alarm, archived)
  SELECT user_id, title, 'once', coalesce(start_on, created_at::date), 0, false, done
  FROM nodinest.plans;

ALTER TABLE "nodinest"."goal_steps" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "nodinest"."goals" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "nodinest"."goals" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "nodinest"."goals" ADD COLUMN "missed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."routine_checks" ADD COLUMN "status" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."routine_checks" ADD COLUMN "value" real;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD COLUMN "end_time" text;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD COLUMN "prayer" text;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD COLUMN "in_journal" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD COLUMN "sound" text;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "nodinest"."routines" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "plans_seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "lat" real;--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "lng" real;
--> statement-breakpoint
GRANT SELECT (plans_seeded, lat, lng), UPDATE (plans_seeded, lat, lng) ON nodinest."user" TO nodinest_app;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS routines_parent_idx ON nodinest.routines (parent_id);
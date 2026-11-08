ALTER TABLE "nodinest"."dm_threads" ADD COLUMN "pinned_id" uuid;--> statement-breakpoint
ALTER TABLE "nodinest"."dm_threads" ADD COLUMN "pinned_at" timestamp with time zone;
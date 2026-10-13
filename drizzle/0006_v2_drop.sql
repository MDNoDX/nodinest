ALTER TABLE "nodinest"."study_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "nodinest"."study_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "nodinest"."notes" DROP CONSTRAINT IF EXISTS "notes_session_id_study_sessions_id_fk";
--> statement-breakpoint
DROP INDEX "nodinest"."plans_user_date_idx";--> statement-breakpoint
CREATE INDEX "plans_user_date_idx" ON "nodinest"."plans" USING btree ("user_id","start_on");--> statement-breakpoint
ALTER TABLE "nodinest"."book_details" DROP COLUMN "edition";--> statement-breakpoint
ALTER TABLE "nodinest"."book_details" DROP COLUMN "table_of_contents";--> statement-breakpoint
ALTER TABLE "nodinest"."book_details" DROP COLUMN "purchase_url";--> statement-breakpoint
ALTER TABLE "nodinest"."book_details" DROP COLUMN "file_format";--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" DROP COLUMN "started_on";--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" DROP COLUMN "completed_on";--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" DROP COLUMN "learning_goals";--> statement-breakpoint
ALTER TABLE "nodinest"."learning_records" DROP COLUMN "personal_notes";--> statement-breakpoint
ALTER TABLE "nodinest"."notes" DROP COLUMN "session_id";--> statement-breakpoint
ALTER TABLE "nodinest"."plans" DROP COLUMN "planned_on";--> statement-breakpoint
ALTER TABLE "nodinest"."plans" DROP COLUMN "planned_minutes";--> statement-breakpoint
ALTER TABLE "nodinest"."resources" DROP COLUMN "source_note";--> statement-breakpoint
DROP TYPE "nodinest"."session_source";--> statement-breakpoint
DROP TYPE "nodinest"."session_status";
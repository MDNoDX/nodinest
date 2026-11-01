ALTER TABLE "nodinest"."routines" ALTER COLUMN "in_journal" SET DEFAULT false;--> statement-breakpoint
-- Lectures and interviews are videos now.
UPDATE nodinest.resources SET type = 'video' WHERE type IN ('lecture', 'interview');
--> statement-breakpoint
-- The year's book holds what was written about the day; plan items only on request.
UPDATE nodinest.routines SET in_journal = false;

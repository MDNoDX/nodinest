ALTER TABLE "nodinest"."user" ADD COLUMN "phone" text;--> statement-breakpoint
GRANT SELECT (phone), UPDATE (phone) ON nodinest."user" TO nodinest_app;

ALTER TABLE "nodinest"."book_details" DROP CONSTRAINT "book_details_attachment_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "nodinest"."files" ADD COLUMN "resource_id" uuid;--> statement-breakpoint
CREATE INDEX "files_resource_idx" ON "nodinest"."files" USING btree ("resource_id");--> statement-breakpoint
ALTER TABLE "nodinest"."book_details" DROP COLUMN "attachment_file_id";
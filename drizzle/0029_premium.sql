CREATE TABLE "nodinest"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"months" integer DEFAULT 1 NOT NULL,
	"method" text NOT NULL,
	"note" text,
	"receipt_file_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_status_chk" CHECK ("nodinest"."payments"."status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "payments_method_chk" CHECK ("nodinest"."payments"."method" IN ('card', 'payme', 'click'))
);
--> statement-breakpoint
ALTER TABLE "nodinest"."user" ADD COLUMN "premium_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodinest"."payments" ADD CONSTRAINT "payments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "nodinest"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodinest"."payments" ADD CONSTRAINT "payments_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "nodinest"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "nodinest"."payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "nodinest"."payments" USING btree ("user_id");--> statement-breakpoint
-- Payments are read and written by the server's owner connection only.
ALTER TABLE nodinest.payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT (premium_until) ON nodinest."user" TO nodinest_app;

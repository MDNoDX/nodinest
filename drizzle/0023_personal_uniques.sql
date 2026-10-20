DROP INDEX "nodinest"."identifiers_scheme_value_uq";--> statement-breakpoint
CREATE INDEX "identifiers_scheme_value_idx" ON "nodinest"."resource_identifiers" USING btree ("scheme","value");--> statement-breakpoint
-- Publisher names are unique per person who adds them, not across the site.
DROP INDEX IF EXISTS nodinest.publishers_name_uq;
--> statement-breakpoint
CREATE UNIQUE INDEX publishers_owner_name_uq ON nodinest.publishers (created_by, nodinest.nn_norm(name)) WHERE deleted_at IS NULL;

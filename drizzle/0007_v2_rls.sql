-- NodiNest v2: RLS for new tables, owner-editable catalog entries, book text search.

-- ─── New personal tables (owner only) ──────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON nodinest.conspect_sections, nodinest.book_text_sources, nodinest.book_pages TO nodinest_app;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nodinest TO nodinest_app;
--> statement-breakpoint
ALTER TABLE nodinest.conspect_sections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.book_text_sources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.book_pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.conspect_sections FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.book_text_sources FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY owner_all ON nodinest.book_pages FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint

-- ─── Book text full-text search ─────────────────────────────────────────────
ALTER TABLE nodinest.book_pages ADD COLUMN search tsvector GENERATED ALWAYS AS (
  to_tsvector('simple', nodinest.nn_norm(content))
) STORED;
--> statement-breakpoint
CREATE INDEX book_pages_search_idx ON nodinest.book_pages USING gin (search);
--> statement-breakpoint
ALTER TABLE nodinest.conspect_sections ADD COLUMN search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', nodinest.nn_norm(title)), 'A') ||
  setweight(to_tsvector('simple', nodinest.nn_norm(content)), 'B')
) STORED;
--> statement-breakpoint
CREATE INDEX conspect_sections_search_idx ON nodinest.conspect_sections USING gin (search);
--> statement-breakpoint

-- ─── Catalog: every signed-in user may add entries and edit their own ──────
CREATE POLICY catalog_insert_own ON nodinest.people FOR INSERT TO nodinest_app
  WITH CHECK (created_by = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY catalog_update_own ON nodinest.people FOR UPDATE TO nodinest_app
  USING (created_by = nodinest.app_user_id()) WITH CHECK (created_by = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY catalog_insert_own ON nodinest.resources FOR INSERT TO nodinest_app
  WITH CHECK (created_by = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY catalog_update_own ON nodinest.resources FOR UPDATE TO nodinest_app
  USING (created_by = nodinest.app_user_id()) WITH CHECK (created_by = nodinest.app_user_id());
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['person_aliases','person_links'] LOOP
    EXECUTE format('CREATE POLICY catalog_child_own ON nodinest.%I FOR ALL TO nodinest_app
      USING (EXISTS (SELECT 1 FROM nodinest.people p WHERE p.id = person_id AND p.created_by = nodinest.app_user_id()))
      WITH CHECK (EXISTS (SELECT 1 FROM nodinest.people p WHERE p.id = person_id AND p.created_by = nodinest.app_user_id()))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['book_details','media_details','resource_contributors','resource_identifiers','resource_links','resource_categories','resource_tags'] LOOP
    EXECUTE format('CREATE POLICY catalog_child_own ON nodinest.%I FOR ALL TO nodinest_app
      USING (EXISTS (SELECT 1 FROM nodinest.resources r WHERE r.id = resource_id AND r.created_by = nodinest.app_user_id()))
      WITH CHECK (EXISTS (SELECT 1 FROM nodinest.resources r WHERE r.id = resource_id AND r.created_by = nodinest.app_user_id()))', t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE POLICY catalog_child_own ON nodinest.resource_relations FOR ALL TO nodinest_app
  USING (EXISTS (SELECT 1 FROM nodinest.resources r WHERE r.id = from_id AND r.created_by = nodinest.app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM nodinest.resources r WHERE r.id = from_id AND r.created_by = nodinest.app_user_id()));
--> statement-breakpoint
-- Catalog tags are plain shared labels: any signed-in user may create them.
CREATE POLICY tags_catalog_insert ON nodinest.tags FOR INSERT TO nodinest_app
  WITH CHECK (owner_id IS NULL AND nodinest.app_user_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY tags_catalog_upsert ON nodinest.tags FOR UPDATE TO nodinest_app
  USING (owner_id IS NULL AND nodinest.app_user_id() IS NOT NULL)
  WITH CHECK (owner_id IS NULL AND nodinest.app_user_id() IS NOT NULL);

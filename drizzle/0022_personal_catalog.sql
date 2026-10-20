-- Personal catalogs: everyone builds their own Darsxona. A user sees the
-- entries they created and those in their own library; the superadmin (admin
-- mode) sees everything. Child rows follow their resource / person.
DROP POLICY IF EXISTS catalog_read ON nodinest.resources;
--> statement-breakpoint
CREATE POLICY catalog_read ON nodinest.resources FOR SELECT TO nodinest_app
  USING (
    nodinest.app_is_superadmin()
    OR created_by = nodinest.app_user_id()
    OR EXISTS (SELECT 1 FROM nodinest.learning_records lr
               WHERE lr.resource_id = resources.id AND lr.user_id = nodinest.app_user_id())
  );
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['book_details','media_details','resource_contributors',
    'resource_identifiers','resource_links','resource_categories','resource_tags'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS catalog_read ON nodinest.%I', t);
    -- The sub-select is itself filtered by the resources policy above.
    EXECUTE format('CREATE POLICY catalog_read ON nodinest.%I FOR SELECT TO nodinest_app
      USING (EXISTS (SELECT 1 FROM nodinest.resources r WHERE r.id = resource_id))', t);
  END LOOP;
END $$;
--> statement-breakpoint
DROP POLICY IF EXISTS catalog_read ON nodinest.resource_relations;
--> statement-breakpoint
CREATE POLICY catalog_read ON nodinest.resource_relations FOR SELECT TO nodinest_app
  USING (EXISTS (SELECT 1 FROM nodinest.resources r WHERE r.id = from_id));
--> statement-breakpoint
DROP POLICY IF EXISTS catalog_read ON nodinest.people;
--> statement-breakpoint
CREATE POLICY catalog_read ON nodinest.people FOR SELECT TO nodinest_app
  USING (
    nodinest.app_is_superadmin()
    OR created_by = nodinest.app_user_id()
    OR EXISTS (SELECT 1 FROM nodinest.resource_contributors c
               JOIN nodinest.resources r ON r.id = c.resource_id
               WHERE c.person_id = people.id)
  );
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['person_aliases','person_links'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS catalog_read ON nodinest.%I', t);
    EXECUTE format('CREATE POLICY catalog_read ON nodinest.%I FOR SELECT TO nodinest_app
      USING (EXISTS (SELECT 1 FROM nodinest.people p WHERE p.id = person_id))', t);
  END LOOP;
END $$;
--> statement-breakpoint
DROP POLICY IF EXISTS catalog_read ON nodinest.publishers;
--> statement-breakpoint
CREATE POLICY catalog_read ON nodinest.publishers FOR SELECT TO nodinest_app
  USING (
    nodinest.app_is_superadmin()
    OR created_by = nodinest.app_user_id()
    OR EXISTS (SELECT 1 FROM nodinest.book_details b WHERE b.publisher_id = publishers.id)
    OR EXISTS (SELECT 1 FROM nodinest.media_details m WHERE m.publisher_id = publishers.id)
  );

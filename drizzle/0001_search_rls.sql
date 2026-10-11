-- NodiNest: search infrastructure + row-level security.
-- Hand-written migration (drizzle-kit --custom). Idempotent where practical.

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- ─── Text normalisation ─────────────────────────────────────────────────────
-- Lower-cases and strips every apostrophe variant used in Uzbek Latin
-- (o‘ g‘ ʼ ' ` ´ ʹ), collapsing whitespace. "O‘zbekiston" → "ozbekiston".
-- Mirrored in src/lib/normalize.ts — keep them in sync.
CREATE OR REPLACE FUNCTION nodinest.nn_norm(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    translate(lower(input), chr(699) || chr(700) || chr(8216) || chr(8217) || chr(96) || chr(180) || chr(697) || chr(39), ''),
    '\s+', ' ', 'g'))
$$;
--> statement-breakpoint

-- ─── Full-text vectors (generated, 'simple' config = language-neutral) ─────
ALTER TABLE nodinest.people ADD COLUMN search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', nodinest.nn_norm(coalesce(full_name, ''))), 'A') ||
  setweight(to_tsvector('simple', nodinest.nn_norm(coalesce(short_description, '') || ' ' || coalesce(nationality, '') || ' ' || coalesce(activity_areas, ''))), 'B') ||
  setweight(to_tsvector('simple', nodinest.nn_norm(coalesce(biography, ''))), 'C')
) STORED;
--> statement-breakpoint
ALTER TABLE nodinest.resources ADD COLUMN search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', nodinest.nn_norm(coalesce(title, '') || ' ' || coalesce(original_title, ''))), 'A') ||
  setweight(to_tsvector('simple', nodinest.nn_norm(coalesce(description, ''))), 'B')
) STORED;
--> statement-breakpoint
ALTER TABLE nodinest.media_details ADD COLUMN search tsvector GENERATED ALWAYS AS (
  to_tsvector('simple', nodinest.nn_norm(coalesce(transcript, '')))
) STORED;
--> statement-breakpoint
ALTER TABLE nodinest.notes ADD COLUMN search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', nodinest.nn_norm(coalesce(title, '') || ' ' || coalesce(quote_text, ''))), 'A') ||
  setweight(to_tsvector('simple', nodinest.nn_norm(coalesce(body, ''))), 'B') ||
  setweight(to_tsvector('simple', nodinest.nn_norm(coalesce(location, ''))), 'D')
) STORED;
--> statement-breakpoint
ALTER TABLE nodinest.study_sessions ADD COLUMN search tsvector GENERATED ALWAYS AS (
  to_tsvector('simple', nodinest.nn_norm(coalesce(note, '')))
) STORED;
--> statement-breakpoint
CREATE INDEX people_search_idx ON nodinest.people USING gin (search);
--> statement-breakpoint
CREATE INDEX resources_search_idx ON nodinest.resources USING gin (search);
--> statement-breakpoint
CREATE INDEX media_details_search_idx ON nodinest.media_details USING gin (search);
--> statement-breakpoint
CREATE INDEX notes_search_idx ON nodinest.notes USING gin (search);
--> statement-breakpoint
CREATE INDEX study_sessions_search_idx ON nodinest.study_sessions USING gin (search);
--> statement-breakpoint

-- ─── Trigram indexes for substring / prefix / fuzzy matching ───────────────
CREATE INDEX people_name_trgm_idx ON nodinest.people USING gin (nodinest.nn_norm(full_name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX person_aliases_trgm_idx ON nodinest.person_aliases USING gin (nodinest.nn_norm(alias) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX resources_title_trgm_idx ON nodinest.resources USING gin (nodinest.nn_norm(title) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX resources_otitle_trgm_idx ON nodinest.resources USING gin (nodinest.nn_norm(coalesce(original_title, '')) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX categories_name_trgm_idx ON nodinest.categories USING gin (nodinest.nn_norm(name_uz || ' ' || name_en) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX tags_norm_trgm_idx ON nodinest.tags USING gin (normalized gin_trgm_ops);
--> statement-breakpoint
-- Fast prefix autocomplete (text_pattern_ops supports LIKE 'abc%').
CREATE INDEX people_name_prefix_idx ON nodinest.people (nodinest.nn_norm(full_name) text_pattern_ops);
--> statement-breakpoint
CREATE INDEX person_aliases_prefix_idx ON nodinest.person_aliases (nodinest.nn_norm(alias) text_pattern_ops);
--> statement-breakpoint

-- ─── Row-level security ─────────────────────────────────────────────────────
-- The app connects as the table owner (migrations, auth, admin ops) and
-- switches to the unprivileged role `nodinest_app` for user-scoped queries:
--   SELECT set_config('app.user_id', <uuid>, true),
--          set_config('app.role', <role>, true),
--          set_config('role', 'nodinest_app', true);
-- (see src/db/index.ts → withUser). Policies below are evaluated for that role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nodinest_app') THEN
    CREATE ROLE nodinest_app NOLOGIN NOINHERIT;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT nodinest_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not grant nodinest_app to %: % (RLS role switching unavailable; set DB_RLS_ROLE empty)', current_user, SQLERRM;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION nodinest.app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION nodinest.app_is_superadmin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.role', true), '') = 'superadmin' $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA nodinest TO nodinest_app;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nodinest TO nodinest_app;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nodinest TO nodinest_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  nodinest.people, nodinest.person_aliases, nodinest.person_links,
  nodinest.resources, nodinest.book_details, nodinest.media_details,
  nodinest.resource_contributors, nodinest.resource_identifiers, nodinest.resource_links,
  nodinest.resource_relations, nodinest.categories, nodinest.resource_categories,
  nodinest.tags, nodinest.resource_tags,
  nodinest.learning_records, nodinest.study_sessions, nodinest.notes, nodinest.note_tags,
  nodinest.collections, nodinest.collection_items, nodinest.goals, nodinest.plans,
  nodinest.suggestions, nodinest.files,
  nodinest.ai_conversations, nodinest.ai_messages, nodinest.ai_actions
TO nodinest_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON nodinest.audit_logs TO nodinest_app;
--> statement-breakpoint
GRANT SELECT ON nodinest.app_settings TO nodinest_app;
--> statement-breakpoint
GRANT SELECT (id, name, email, image, role, status, locale, timezone, created_at) ON nodinest."user" TO nodinest_app;
--> statement-breakpoint
GRANT UPDATE (name, image, locale, timezone, updated_at) ON nodinest."user" TO nodinest_app;
--> statement-breakpoint

-- Enable RLS on every table. Tables without a policy for nodinest_app are
-- fully denied to it (auth tables, rate_limits, ai_cache…).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'nodinest' LOOP
    EXECUTE format('ALTER TABLE nodinest.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint

-- Users: see yourself (superadmin sees everyone); update yourself.
CREATE POLICY user_select ON nodinest."user" FOR SELECT TO nodinest_app
  USING (id = nodinest.app_user_id() OR nodinest.app_is_superadmin());
--> statement-breakpoint
CREATE POLICY user_update ON nodinest."user" FOR UPDATE TO nodinest_app
  USING (id = nodinest.app_user_id()) WITH CHECK (id = nodinest.app_user_id());
--> statement-breakpoint

-- Shared catalog: readable by every signed-in user, writable by superadmin.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['people','person_aliases','person_links','resources','book_details',
    'media_details','resource_contributors','resource_identifiers','resource_links',
    'resource_relations','categories','resource_categories','resource_tags'] LOOP
    EXECUTE format('CREATE POLICY catalog_read ON nodinest.%I FOR SELECT TO nodinest_app USING (nodinest.app_user_id() IS NOT NULL)', t);
    EXECUTE format('CREATE POLICY catalog_write ON nodinest.%I FOR ALL TO nodinest_app USING (nodinest.app_is_superadmin()) WITH CHECK (nodinest.app_is_superadmin())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Tags: catalog tags (owner NULL) readable by all, written by superadmin;
-- personal tags only visible to their owner.
CREATE POLICY tags_read ON nodinest.tags FOR SELECT TO nodinest_app
  USING (owner_id IS NULL OR owner_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY tags_write ON nodinest.tags FOR ALL TO nodinest_app
  USING (owner_id = nodinest.app_user_id() OR (owner_id IS NULL AND nodinest.app_is_superadmin()))
  WITH CHECK (owner_id = nodinest.app_user_id() OR (owner_id IS NULL AND nodinest.app_is_superadmin()));
--> statement-breakpoint

-- Strictly private, owner-only tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_records','study_sessions','goals','plans','collections',
    'ai_conversations','ai_messages','ai_actions'] LOOP
    EXECUTE format('CREATE POLICY owner_all ON nodinest.%I FOR ALL TO nodinest_app USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE POLICY collection_items_owner ON nodinest.collection_items FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id())
  WITH CHECK (
    user_id = nodinest.app_user_id()
    AND EXISTS (SELECT 1 FROM nodinest.collections c WHERE c.id = collection_id AND c.user_id = nodinest.app_user_id())
    AND (note_id IS NULL OR EXISTS (SELECT 1 FROM nodinest.notes n WHERE n.id = note_id AND n.user_id = nodinest.app_user_id()))
  );
--> statement-breakpoint

-- Notes: owner has full access; public, non-deleted notes are readable by
-- other signed-in users. Private notes never leave their owner.
CREATE POLICY notes_owner ON nodinest.notes FOR ALL TO nodinest_app
  USING (user_id = nodinest.app_user_id()) WITH CHECK (user_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY notes_public_read ON nodinest.notes FOR SELECT TO nodinest_app
  USING (visibility = 'public' AND deleted_at IS NULL AND nodinest.app_user_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY note_tags_owner ON nodinest.note_tags FOR ALL TO nodinest_app
  USING (EXISTS (SELECT 1 FROM nodinest.notes n WHERE n.id = note_id AND n.user_id = nodinest.app_user_id()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM nodinest.notes n WHERE n.id = note_id AND n.user_id = nodinest.app_user_id())
    AND EXISTS (SELECT 1 FROM nodinest.tags g WHERE g.id = tag_id AND g.owner_id = nodinest.app_user_id())
  );
--> statement-breakpoint

-- Suggestions: authors see/withdraw their own; superadmin reviews all.
CREATE POLICY suggestions_read ON nodinest.suggestions FOR SELECT TO nodinest_app
  USING (user_id = nodinest.app_user_id() OR nodinest.app_is_superadmin());
--> statement-breakpoint
CREATE POLICY suggestions_insert ON nodinest.suggestions FOR INSERT TO nodinest_app
  WITH CHECK (user_id = nodinest.app_user_id() AND status = 'pending');
--> statement-breakpoint
CREATE POLICY suggestions_update ON nodinest.suggestions FOR UPDATE TO nodinest_app
  USING (user_id = nodinest.app_user_id() OR nodinest.app_is_superadmin())
  WITH CHECK (nodinest.app_is_superadmin() OR (user_id = nodinest.app_user_id() AND status IN ('pending', 'withdrawn')));
--> statement-breakpoint

-- Files: owner full access; catalog images readable by all signed-in users.
CREATE POLICY files_owner ON nodinest.files FOR ALL TO nodinest_app
  USING (owner_id = nodinest.app_user_id()) WITH CHECK (owner_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY files_catalog_read ON nodinest.files FOR SELECT TO nodinest_app
  USING (is_catalog AND deleted_at IS NULL AND nodinest.app_user_id() IS NOT NULL);
--> statement-breakpoint

-- Audit log: anyone may append entries about their own actions; only
-- superadmin can read.
CREATE POLICY audit_insert ON nodinest.audit_logs FOR INSERT TO nodinest_app
  WITH CHECK (actor_id = nodinest.app_user_id());
--> statement-breakpoint
CREATE POLICY audit_read ON nodinest.audit_logs FOR SELECT TO nodinest_app
  USING (nodinest.app_is_superadmin());
--> statement-breakpoint
CREATE POLICY settings_read ON nodinest.app_settings FOR SELECT TO nodinest_app
  USING (nodinest.app_user_id() IS NOT NULL);

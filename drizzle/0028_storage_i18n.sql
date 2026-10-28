ALTER TABLE "nodinest"."categories" ADD COLUMN "name_ru" text;--> statement-breakpoint
ALTER TABLE "nodinest"."files" ADD COLUMN "tg_parts" jsonb;--> statement-breakpoint
-- Profiles: the app role reads / updates its own username and names (RLS: own row).
GRANT SELECT (username, first_name, last_name) ON nodinest."user" TO nodinest_app;
--> statement-breakpoint
GRANT UPDATE (username, first_name, last_name) ON nodinest."user" TO nodinest_app;
--> statement-breakpoint
-- The 2026 Uzbek alphabet: ş ç ö ğ fold onto sh ch o g, so text in either
-- spelling finds the other. Mirrored in src/lib/normalize.ts.
CREATE OR REPLACE FUNCTION nodinest.nn_norm(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    translate(
      replace(replace(translate(lower(input), 'öğ', 'og'), 'ş', 'sh'), 'ç', 'ch'),
      chr(699) || chr(700) || chr(8216) || chr(8217) || chr(96) || chr(180) || chr(697) || chr(39), ''),
    '\s+', ' ', 'g'))
$$;
--> statement-breakpoint
-- Stored search vectors and expression indexes are computed again.
UPDATE nodinest.people SET full_name = full_name;
--> statement-breakpoint
UPDATE nodinest.resources SET title = title;
--> statement-breakpoint
UPDATE nodinest.media_details SET resource_id = resource_id;
--> statement-breakpoint
UPDATE nodinest.notes SET kind = kind;
--> statement-breakpoint
UPDATE nodinest.writeups SET id = id;
--> statement-breakpoint
UPDATE nodinest.book_pages SET id = id;
--> statement-breakpoint
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, indexname FROM pg_indexes
           WHERE schemaname = 'nodinest' AND indexdef LIKE '%nn_norm%' LOOP
    EXECUTE format('REINDEX INDEX %I.%I', r.schemaname, r.indexname);
  END LOOP;
END $$;
--> statement-breakpoint
-- Category names: the new Uzbek alphabet and Russian names.
UPDATE nodinest.categories SET name_uz = 'Şaxsiy rivojlaniş' WHERE slug = 'self-development';
--> statement-breakpoint
UPDATE nodinest.categories SET name_ru = v.ru FROM (VALUES
  ('economics', 'Экономика'), ('fantasy', 'Фантастика и фэнтези'), ('history', 'История'),
  ('languages', 'Языки'), ('literature', 'Литература'), ('mathematics', 'Математика'),
  ('philosophy', 'Философия'), ('programming', 'Программирование'), ('psychology', 'Психология'),
  ('religion', 'Религия'), ('romance', 'Романтика'), ('science', 'Наука'),
  ('self-development', 'Саморазвитие'), ('technology', 'Технологии')
) AS v(slug, ru) WHERE nodinest.categories.slug = v.slug AND nodinest.categories.name_ru IS NULL;

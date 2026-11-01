ALTER TYPE "nodinest"."resource_type" ADD VALUE 'file' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "nodinest"."publishers" ADD COLUMN "founded_on" text;--> statement-breakpoint
ALTER TABLE "nodinest"."publishers" ADD COLUMN "founder" text;--> statement-breakpoint
-- Fewer genres: science takes in mathematics, programming and technology; biography is added.
UPDATE nodinest.resource_categories rc SET category_id = s.id
  FROM nodinest.categories s, nodinest.categories o
  WHERE s.slug = 'science' AND o.slug IN ('mathematics', 'programming', 'technology')
    AND rc.category_id = o.id
    AND NOT EXISTS (SELECT 1 FROM nodinest.resource_categories x WHERE x.resource_id = rc.resource_id AND x.category_id = s.id);
--> statement-breakpoint
DELETE FROM nodinest.resource_categories rc USING nodinest.categories o
  WHERE rc.category_id = o.id AND o.slug IN ('mathematics', 'programming', 'technology');
--> statement-breakpoint
UPDATE nodinest.categories SET deleted_at = now() WHERE slug IN ('mathematics', 'programming', 'technology');
--> statement-breakpoint
UPDATE nodinest.categories SET name_uz = 'Ilm-fan', name_en = 'Science', name_ru = 'Наука' WHERE slug = 'science';
--> statement-breakpoint
INSERT INTO nodinest.categories (slug, name_uz, name_en, name_ru, sort_order)
  VALUES ('biography', 'Biografiya', 'Biography', 'Биография', 90)
  ON CONFLICT (slug) DO UPDATE SET deleted_at = NULL;

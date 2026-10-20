-- Two more genres for fiction: Fantastika (science fiction & fantasy) and Romantika (romance).
INSERT INTO "nodinest"."categories" ("slug", "name_uz", "name_en", "sort_order")
VALUES ('fantasy', 'Fantastika', 'Science fiction & fantasy', 12),
       ('romance', 'Romantika', 'Romance', 13)
ON CONFLICT ("slug") DO NOTHING;

# Data model

All tables are in the PostgreSQL schema `nodinest`. Source of truth: `src/db/schema.ts`
plus the hand-written `drizzle/0001_search_rls.sql` (search vectors, trigram indexes,
`nn_norm()`, RLS policies).

## Shared catalog (one row per real-world entity, never per user)

- `people` — full name, short description, biography, partial `birth_date`/`death_date`
  (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`; unknown = NULL, CHECK-constrained), nationality,
  roles (`text[]` of fixed values), activity areas, portrait (URL or uploaded file),
  website, verification status. Soft-deleted via `deleted_at`.
- `person_aliases` (searchable alternative names), `person_links` (sources/references).
- `resources` — unified model with `type` (book, course, video, lecture, interview,
  article, podcast, other), title/original title, description, cover, language, partial
  publication date, source URL + verification note.
- `book_details` (1:1) — publisher, edition, page count, original language, table of
  contents, reading/purchase links, format metadata (PDF/EPUB/print).
- `media_details` (1:1) — platform, channel, duration, transcript, transcript URL.
- `resource_contributors` — resource ↔ person with role and order (PK resource+person+role);
  this is how relationships work in both directions.
- `resource_identifiers` — ISBN-10/13 (checksum-validated), DOI, YouTube id, Wikidata…;
  `UNIQUE (scheme, value)` prevents duplicate editions with the same ISBN.
- `resource_relations` — edition_of / translation_of / part_of / related (no self-links).
- `categories` (nestable, bilingual names, admin-managed, cycle-checked) ↔ `resource_categories`.
- `tags` — `owner_id NULL` = catalog tag, otherwise a user's private tag
  (`UNIQUE NULLS NOT DISTINCT (owner_id, normalized)`), ↔ `resource_tags`, `note_tags`.

## Personal data (private, RLS: owner only)

- `learning_records` — one per (user, resource) (`UNIQUE`): status (planned / in_progress /
  completed / paused; legacy `abandoned` is shown as paused), `started_at` / `completed_at`
  (timestamptz, exact time), rating 1–10, short review, progress current/total/unit.
- `writeups` — the user's taqriz of a resource: one Tiptap/ProseMirror JSON `doc` per
  (user, resource), plus `plain` text (FTS) and `words`. Chapters = headings (optional).
- `book_text_sources` (the user's PDF file or reading URL; status, page count) and
  `book_pages` (one row per extracted page, FTS-indexed) — used for in-book search and the AI.
- `notes` — `kind` note|quote; quotes keep the exact `quote_text` separate from the user's
  `body` commentary; optional resource, attributed person (only set explicitly),
  page range, chapter/section, video timestamp, visibility (private|public), verification.
- `collections` (`ranked` flag) + `collection_items` (exactly one resource or note,
  `position` for ranked "Top N" lists); default collections are seeded via `system_key`.
- `goals` (completed resources or pages × week/month/year × target, optional type filter),
  `plans` (title, optional resource, `start_on` / `end_on`, done).

## Collaboration & operations

- `suggestions` — operation (create/update/archive), target, validated `payload`,
  `base_snapshot` (record at submission, for before/after diffs and staleness warnings),
  explanation, source URLs, status, reviewer, review note, applied target.
- `audit_logs` — append-only record of privileged/global changes with before/after snapshots.
- `files` — Vercel Blob metadata (owner, pathname, type, size, purpose, catalog flag, resource).
- `publishers` — catalog entries (name unique by normalised name, city, country, website);
  `book_details.publisher_id` points to them. Created on the fly from a typed name.
- `media_details` (all non-book types): platform, channel ("where"), duration, `lesson_count`.
- Dates on people/resources accept `YYYY[-MM[-DD]]`, `YYYY~` and `A/B` ranges (CHECK).
- Catalog rows carry `created_by`; RLS lets the creator (or admin mode) edit their own entries.
- `ai_conversations`, `ai_messages`, `ai_actions` (proposed → completed|failed|rejected).
- `ai_cache` (public URL metadata, TTL), `app_settings` (AI settings), `rate_limits`.
- Better Auth: `user` (+ `role`, `status`, `locale`, `timezone`), `session`, `account`, `verification`.

## Integrity & deletion

- Personal rows cascade when a user is deleted; catalog rows referenced by contributors are
  `RESTRICT`ed (people) — catalog items are archived (soft delete) and restorable instead.
- Notes go to a trash (`deleted_at`) and can be restored.
- Duplicate detection: identifiers (exact), source URL (exact), normalised title/name
  similarity (pg_trgm ≥ 0.55–0.6, apostrophe- and case-insensitive), aliases, birth date.

## Search columns

Generated `search tsvector` columns on `people`, `resources`, `media_details` (transcripts),
`notes`, `writeups`, `book_pages`, built with `to_tsvector('simple', nn_norm(...))` and weights
(A title/name, B description/body, C biography, D location). GIN indexes on all of them plus
trigram GIN and `text_pattern_ops` indexes on names, aliases and titles.

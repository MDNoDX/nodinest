# Architecture

## Overview

```
Browser ──► Next.js 16 on Vercel (one deployment)
              ├─ Server Components (pages)      ─┐
              ├─ Server Actions (src/app/actions) ├─► src/server/* domain services ─► PostgreSQL (Supabase)
              ├─ Route handlers (src/app/api)    ─┘          │                         (RLS, FTS, pg_trgm)
              └─ Better Auth (/api/auth/*) ── Google OAuth    ├─► Gemini API (optional)
                                                              └─► Supabase Storage (optional, signed URLs)
```

One deployable unit, no separate backend, no Redis, no vector DB — all within free tiers.

## Request flow

1. A page calls `pageContext()` → `requireUser()` reads the Better Auth session and **re-reads
   role/status from the database** (never trusted from a cookie or the client).
2. Data access goes through services in `src/server/`. User-scoped reads/writes run inside
   `withUser(db, ctx, fn)`: one transaction that sets `app.user_id`, `app.role` and
   `SET ROLE nodinest_app`, so PostgreSQL row-level security enforces ownership even if a
   query forgot its `WHERE user_id = …`.
3. Mutations are server actions wrapped by `run()`, which authenticates, validates with zod
   and returns a typed `ActionResult` (`{ ok: false, code }` maps to a translated message).

## Modules

| Area                        | Service                                   | Notes                                                                                                                                                                    |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog (people, resources) | `server/catalog.ts`                       | type-specific details (`book_details`, `media_details`), contributors, identifiers, links, relations, categories, tags; autocomplete; duplicate detection                |
| Suggestions & moderation    | `server/suggestions.ts`                   | superadmin writes apply directly; users create suggestions; approval is transactional + audited                                                                          |
| Records & taqriz            | `server/records.ts`, `server/writeups.ts` | learning records (status, start/finish date-time, 10-star rating, progress, short opinion); free-form taqriz documents with optional chapters, conflict-checked autosave |
| Publishers                  | `server/publishers.ts`                    | publisher catalog (search, find-or-create, detail with books, creator/admin edits)                                                                                       |
| Book text                   | `server/booktext.ts`                      | PDF/URL text extraction with `unpdf` into `book_pages` (FTS); page search and page reads for the AI                                                                      |
| Notes, tags, collections    | `server/notes.ts`                         | private by default; public quotes readable by others; personal tags                                                                                                      |
| Goals & plans               | `server/goals.ts`                         | plans = start on / finish on; goal progress from completed records (count or pages)                                                                                      |
| Stats                       | `server/stats.ts`                         | collection metrics: books/pages read, courses, media minutes, by year/type/rating, authors                                                                               |
| Search                      | `server/search.ts`                        | FTS + trigram, grouped results, snippets                                                                                                                                 |
| AI                          | `server/ai/*`                             | Gemini wrapper, tool registry, assistant loop, confirmation                                                                                                              |
| URL import                  | `server/url-import.ts` + `lib/net/*`      | SSRF-safe fetch, YouTube oEmbed, Wikipedia REST, OpenGraph/JSON-LD, robots.txt                                                                                           |
| Storage                     | `server/storage.ts`                       | Supabase private bucket, signed upload/download URLs                                                                                                                     |
| Admin                       | `server/admin.ts`                         | users/roles, categories, audit log, overview                                                                                                                             |

## Key decisions

- **Better Auth instead of Supabase Auth**: auth tables live in our own schema, which keeps
  RLS, foreign keys and tests in one Postgres; local development and E2E need no Supabase.
- **Own schema `nodinest`** (not `public`) so Supabase's auto-generated Data API does not
  expose tables; RLS is enabled on every table anyway.
- **Cache Components off**: nearly every page is per-user; classic dynamic rendering is simpler.
- **Search**: PostgreSQL `simple` tsvectors over an apostrophe-normalised text
  (`nn_norm`) with prefix tsqueries (AND semantics) + trigram indexes for substring/fuzzy
  name matching. Uzbek has no stemmer in Postgres; prefix matching covers inflection well.
  Semantic/vector search was deliberately not added (no free reliable embedding store).
- **AI never writes directly**: write tools create `ai_actions` proposals; a click on
  Confirm executes them through the same services/permissions as the UI.
- **Rate limits in Postgres** (`rate_limits` table, fixed windows) — no Redis on the free tier.
- **Durations**: timer state transitions are single SQL `UPDATE … WHERE status = …`
  statements using `now()`, so double clicks/stale tabs can't double count; paused time is
  never added. Days are bucketed in the user's IANA time zone by session start time.

## i18n

`next-intl` without locale-prefixed URLs: the `NEXT_LOCALE` cookie (and `user.locale`)
chooses `uz` (default) or `en`. All UI strings are in `messages/*.json`; user content is
never translated.

## Theming & design

CSS variables in `src/app/globals.css` (`:root` light, `.dark` dark) mapped to Tailwind
tokens. `next-themes` stores the preference (`nodinest-theme`) and injects a blocking script
to avoid a flash. Fonts: Inter (UI) and Source Serif 4 (titles, quotes), both with
Latin-Extended for Uzbek. Motion is limited and disabled under `prefers-reduced-motion`.

## Speed and offline (v3)

- Session: Better Auth signed cookie cache (5 min) — no session-table query per request; role and
  status are still re-read from `user` on every request.
- Pages: `(app)/loading.tsx` gives instant navigation feedback; `staleTimes.dynamic = 30` makes
  re-visits instant (mutations revalidate). Independent queries inside one `withUser`
  transaction are issued with `Promise.all` (postgres-js pipelines them on the connection).
- PWA: installable (manifest + icons); `public/sw.js` serves visited pages, covers and opened
  PDFs offline; taqriz edits made offline are kept in `localStorage` and synced on reconnect
  (`CONFLICT` if the server copy changed meanwhile → the user chooses).

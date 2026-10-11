# Implementation plan & status

| Phase                        | Scope                                                                                                                                                                                                       | Status                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1. Repository & architecture | Next.js 16 scaffold in `NodiNest/`, docs, conventions, env                                                                                                                                                  | ✅                          |
| 2. Foundation                | Design tokens, logo/brand, app shell (sidebar + compact mode + mobile drawer), uz/en i18n, light/dark/system theme without flash, command palette (⌘K)                                                      | ✅                          |
| 3. Database & auth           | Drizzle schema + migrations, FTS/trigram, RLS role, Better Auth + Google, secure superadmin bootstrap, suspended users                                                                                      | ✅                          |
| 4. Core library              | People, resources (type-specific forms), contributors autocomplete with inline "create", identifiers/ISBN validation, links, relations, categories/tags, duplicate detection, archive/restore, detail pages | ✅                          |
| 5. Personal learning         | Learning records, timer & manual sessions, notes/quotes (exact text vs commentary), trash, personal tags, collections & status shelves, goals, plans, dashboard                                             | ✅                          |
| 6. Search & analytics        | Universal grouped search with filters/sort/pagination/snippets; insights (daily, weekly, monthly, by type/topic/time of day, streaks)                                                                       | ✅                          |
| 7. AI assistant              | Gemini tool calling, proposals + confirmation, URL import (SSRF-safe), quota/429 handling, per-user limits, admin tool allowlist, free model fallback                                                       | ✅                          |
| 8. Collaboration & admin     | Suggestions with before/after diff, approve/reject/withdraw, audit log, users/roles, topics, archive, AI settings, system overview                                                                          | ✅                          |
| 9. Quality & deployment      | 88 unit+integration tests, 5 Playwright E2E, lint/typecheck/format, production build, deployment guide                                                                                                      | ✅ code / ⏳ external setup |

## Remaining external steps (need the owner's accounts)

1. Create the Supabase project, run migrations, create the storage bucket.
2. Create Google OAuth credentials with the production callback URL.
3. Create (or reuse) a Gemini API key.
4. Push to GitHub and import into Vercel with the env vars from `docs/DEPLOYMENT.md`.

## Known limitations / next ideas

- No semantic (embedding) search — would need a free vector store; FTS + trigram is used.
- Better Auth's built-in rate limiter uses memory storage (per serverless instance); the
  app's own limits (AI, uploads, URL import, API) are database-backed.
- Rich-text notes are plain text (with preserved line breaks); Markdown rendering is a
  possible follow-up.
- Session "days" use the session start time; a session spanning midnight counts fully on
  the start day.
- Manual-session form uses the browser's local time for input; stats use the time zone
  from Settings. Keep them the same for best results.
- PDF/EPUB attachments are personal (owner-only); NodiNest does not download or
  redistribute books from third-party sites.

# NodiNest — working notes for Claude Code

Read `AGENTS.md` too: this is **Next.js 16**; check `node_modules/next/dist/docs/` before
using unfamiliar APIs (e.g. `proxy.ts` replaced `middleware.ts`, async `params`).

## Layout

```
src/
  app/                 routes. (auth)/login, (app)/* = signed-in shell, api/* = route handlers
  app/actions/         server actions — thin: validate ids, call src/server/*, revalidate
  server/              domain services (catalog, publishers, suggestions, records, writeups,
                       booktext, notes, goals, stats, search, lookup, admin, storage, url-import, ai/*).
                       All DB access lives here.
  db/                  schema.ts (Drizzle), client.ts (createDb, withUser), index.ts (app db)
  lib/                 pure helpers (validation, normalize, durations, dates, writeup-doc, hues, net/*)
  components/          ui/ primitives, layout/, feature folders
  i18n/ + messages/    next-intl (cookie-based locale, uz default). Keys must exist in BOTH files.
drizzle/               SQL migrations. 0001_search_rls.sql is hand-written (FTS, trigram, RLS).
tests/                 unit/, integration/ (real Postgres), e2e/ (Playwright)
```

## Rules that keep the app correct and safe

- **Every user-scoped query goes through `withUser(db, ctx, fn)`** (sets `app.user_id`,
  `app.role`, switches to role `nodinest_app` → RLS active) **and** filters by owner in SQL.
  The plain `db` (table owner) is only for auth, rate limits, caches, settings, audit and
  already-authorised admin operations.
- Roles come from the DB (`getCurrentUser`), never from the client. The superadmin acts as a
  normal user until the "Admin" switch (httpOnly cookie `nn_admin_mode`) is on: `user.role`
  is the _effective_ role, `user.isSuperadmin` / `ctx.superadminAccount` the account. AI
  limits always use the account flag (unlimited for the superadmin). Server actions use
  `run()` (src/app/actions/_run.ts) which authenticates and maps errors to `ActionResult`.
- Catalog writes: anyone may create entries (they own them via `created_by`). Edits apply
  directly when `canEditCatalog` (admin mode or creator), otherwise they become suggestions.
  RLS mirrors this (drizzle/0007). Approval re-validates + re-checks duplicates and audits.
- All writes validate with zod schemas in `src/lib/validation.ts` (shared by forms, AI, approval).
- AI tools live in the `TOOLS` registry in `server/ai/tools.ts`. Read tools run at once; EVERY
  write tool is `mode: "confirm"`: it becomes an `ai_actions` proposal card (optional `preview`,
  e.g. duplicates for add_resource) and runs only after the user confirms in the chat (single or
  "confirm all", in creation order). Cards may pass only whitelisted choices (`useExistingId`,
  `createNew`). Only `index_book_text` runs without a card. Never add a tool that runs
  SQL/shell or bypasses `submitPerson/submitResource`.
- Duplicates: `server/merge.ts` (`mergeResources` moves the user's record/notes/taqriz/collection
  places to the kept entry, archives the rest; `findLibraryDuplicates` → /library/duplicates).
- AI attachments and voice notes: files with purpose `media` (images, PDFs, audio ≤ 30 MB),
  passed to Gemini inline by `server/ai/media.ts`; `transcribeAudio` turns speech into text.
- Never invent data (dates, ISBNs, quotes). Unknown → NULL. Dates are flexible text (EDTF subset,
  `lib/dates.ts` + DB CHECK): `YYYY[-MM[-DD]]`, approx `1150~`, range/century `1101/1200`.
- Reading start/finish (`learning_records.started_at/completed_at`) carry a precision column
  (year | month | day | time, NULL = time); partial dates are stored as noon UTC. Wire format and
  helpers: `lib/reading-date.ts`. Stats that need days (fastest reads) use only day/time precision.
- Media dock (`components/media/media-dock.tsx`, mounted in AppShell): YouTube (postMessage API,
  no external script) or audio/video files keep playing across pages. Alt+K/J/L/T shortcuts;
  Alt+T sends `nn:media-stamp`, which the taqriz editor inserts at the cursor. Shortcuts are
  user-changeable (`lib/shortcuts.ts`, per device). With nothing playing, play/pause goes to the
  Mac app bridge (`webkit.messageHandlers.nodinest`, main frame + our origin only) → system key.
- Taqriz AI panel (`components/taqriz/ai-panel.tsx`, `server/ai/study.ts`): explain the selection
  (book text + facts, no web search on the free tier) and "listen & write": YouTube segments go to
  Gemini as URL + offsets; same-origin files are recorded from the dock via Web Audio.
- Full transcripts (`server/ai/transcripts.ts`, table `transcripts`, export
  `/api/export/transcript/[id]`): study pass (brief: language, speakers, glossary, outline) →
  90 s transcript / 300 s konspekt segments → finish (konspekt merge). Gemini blocks verbatim
  text matching published captions (finishReason RECITATION): halve, then smooth, then a gap
  marker. gemini-flash-lite rejects `thinkingBudget: 0` — use ≥ 512.
- Resume points (`server/resume.ts`, table `resume_points`, POST `/api/resume` keepalive): media
  second (from the dock) + taqriz cursor (text anchor `b:`/`a:`); sign-in lands on `/resume`.
- Taqriz find/replace: `components/taqriz/find.ts` (decorations; folds case + Uzbek apostrophes).
- Books have their own details (publisher entity, pages, original + edition date). Every other
  type shares one set in `media_details` (release date, duration, "where", language, link;
  courses + lesson count). `BOOK_LIKE` / `MEDIA_LIKE` in validation.ts decide which.
- Taqriz = one Tiptap JSON document per (user, resource) in `writeups`; always store it through
  `sanitizeDoc` (lib/writeup-doc.ts allowlist). Headings are the optional chapters/outline.
- Text search normalisation exists twice and must match: `nodinest.nn_norm()` (SQL) and
  `normalizeText()` (TS).
- Client components cannot receive functions from server components (pass preformatted
  strings, e.g. `BarChart` takes `display`). Shared defaults for forms live in `*-value.ts`.
- New UI strings: add to `messages/uz.json` AND `messages/en.json` (unit test enforces parity).

## Rendering model

`cacheComponents` is **off** on purpose: almost every route reads the session. Pages use
`export const dynamic = "force-dynamic"` and `pageContext()` from `src/lib/page.ts`.

## Commands

`npm run dev` (port 3000; this machine uses 3100 via .claude/launch.json),
`npm run typecheck && npm run lint && npm test`, `npm run test:e2e`,
`npm run db:generate` then `npm run db:migrate`. drizzle-kit `generate` is interactive when
it suspects a rename — split such schema changes into two steps.

## Local environment

Postgres.app at 127.0.0.1:5432 (user `mdnodx`): DBs `nodinest`, `nodinest_test`, `nodinest_e2e`.
`.env.local` holds local secrets (gitignored). The launch config `nodinest-dev-ai` injects
`GEMINI_API_KEY` from `~/Library/Application Support/Nodogram/gemini.key` without writing it
to the repo. Gemini free quotas are per model: `GEMINI_FALLBACK_MODELS` lists free fallbacks.

**Warning:** `vercel link`, `vercel env pull` and `vercel blob create-store` overwrite
`.env.local` with production values. Pull into a scratch file instead
(`vercel env pull /tmp/x.env --environment=production`) and restore `.env.local` if touched.
Offline/PWA: `public/sw.js` (registered in production only by `components/pwa/pwa.tsx`):
cache-first static, SWR images, network-first pages with cached fallback + `/offline`; caches and
`nn:*` localStorage are wiped on sign-out. Bump `VERSION` in sw.js when its rules change.
Icons: `node scripts/make-icons.mjs`. To test the SW locally use the `nodinest-prod` launch config
(after `next build`) — it only runs public pages, since prod cookies need HTTPS.
Files: Vercel Blob (private store `nodinest-files`), client upload via `/api/blob/upload`,
served via `/api/files/[id]`. PDF text: `unpdf` → `book_pages` (FTS) in `server/booktext.ts`.

## Mac app (`mac/`)

Native AppKit + WKWebView wrapper around the production site (`./mac/build.sh` → universal
`dist/NodiNest.app` + `dist/NodiNest-<ver>.dmg`, ad-hoc signed). Google blocks sign-in inside web
views, so Google navigations open `ASWebAuthenticationSession` on `/app-login`, which returns
`nodinest://auth?code=…` (one-time, hashed, 2 min — `server/app-handoff.ts`); the app redeems it
at `/api/app/handoff`. Downloads use a Save sheet (no folder-permission prompt). Point it at a
local server with `defaults write app.nodinest.mac NodiNestBaseURL http://localhost:3100`
(delete it afterwards); `NODINEST_DEBUG=1` prints navigation/download logs to stderr.

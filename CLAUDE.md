# NodiNest — working notes for Claude Code

Read `AGENTS.md` too: this is **Next.js 16**; check `node_modules/next/dist/docs/` before
using unfamiliar APIs (e.g. `proxy.ts` replaced `middleware.ts`, async `params`).

## Layout

```
src/
  app/                 routes. (auth)/login, (app)/* = signed-in shell, api/* = route handlers
  app/actions/         server actions — thin: validate ids, call src/server/*, revalidate
  server/              domain services (catalog, suggestions, journal, notes, goals, stats,
                       search, admin, storage, url-import, ai/*). All DB access lives here.
  db/                  schema.ts (Drizzle), client.ts (createDb, withUser), index.ts (app db)
  lib/                 pure helpers (validation, normalize, durations, dates, streaks, net/*)
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
- Roles come from the DB (`getCurrentUser`), never from the client. Server actions use
  `run()` (src/app/actions/_run.ts) which authenticates and maps errors to `ActionResult`.
- Catalog writes: superadmin → `apply*` in `server/catalog.ts`; everyone else → suggestions.
  Approval re-validates + re-checks duplicates in one transaction and writes audit logs.
- All writes validate with zod schemas in `src/lib/validation.ts` (shared by forms, AI, approval).
- AI tools are declared in `server/ai/tools.ts`; write tools only create `ai_actions`
  proposals; `server/ai/actions.ts` executes after explicit confirmation. Never add a tool
  that runs SQL/shell or bypasses `submitPerson/submitResource`.
- Never invent data (dates, ISBNs, quotes). Unknown → NULL. Partial dates are `YYYY[-MM[-DD]]`.
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

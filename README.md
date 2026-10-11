# NodiNest

**Bilimlar uchun shaxsiy makon. — A home for everything you learn.**

NodiNest is a bilingual (Uzbek Latin / English) personal knowledge library and learning
journal: books, videos, lectures, articles, podcasts and courses; the people behind them;
your private notes and exact quotations; timed study sessions, goals and plans; universal
search; insights from real data; and a Gemini-powered assistant that can only _propose_
changes you confirm.

|         |                                                                                        |
| ------- | -------------------------------------------------------------------------------------- |
| Stack   | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Radix UI |
| Data    | PostgreSQL (Supabase free tier in production) · Drizzle ORM · row-level security       |
| Auth    | Better Auth · Google OAuth · server-side roles (superadmin / user)                     |
| AI      | Google Gemini (`@google/genai`), free tier, optional                                   |
| Files   | Supabase Storage (private bucket, signed URLs), optional                               |
| Hosting | Vercel (Hobby)                                                                         |

**Production:** https://nodinest.vercel.app · repo: https://github.com/MDNoDX/nodinest

## Quick start (local)

Requirements: Node ≥ 20.9, PostgreSQL ≥ 15 (Postgres.app works).

```bash
npm install
cp .env.example .env.local            # then edit values
createdb nodinest
npm run db:migrate
npm run db:seed                       # optional starter topics (no fake content)
npm run dev
```

Without Google credentials you can sign in locally with the **developer login**
(`ENABLE_DEV_LOGIN=true`; it is hard-disabled in production builds). Make yourself
superadmin locally with:

```bash
npm run admin:grant -- you@example.com
```

## Scripts

| Command                                     | What it does                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev` / `build` / `start`           | Next.js                                                                  |
| `npm run lint` · `typecheck` · `format`     | ESLint · `tsc --noEmit` · Prettier                                       |
| `npm run db:generate`                       | Generate a migration from `src/db/schema.ts`                             |
| `npm run db:migrate`                        | Apply migrations in `drizzle/`                                           |
| `npm run db:seed`                           | Starter topic taxonomy (idempotent)                                      |
| `npm run admin:grant -- <email> [--revoke]` | Operator role change (audited)                                           |
| `npm run test:unit`                         | Pure logic tests                                                         |
| `npm run test:integration`                  | Real-Postgres tests (`TEST_DATABASE_URL`, default local `nodinest_test`) |
| `npm run test:e2e`                          | Playwright against `next dev` on a separate DB (`nodinest_e2e`)          |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, request flow, decisions
- [docs/SCHEMA.md](docs/SCHEMA.md) — data model and integrity rules
- [docs/SECURITY.md](docs/SECURITY.md) — auth, roles, RLS, SSRF, AI safety
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Supabase + Google + Gemini + Vercel, step by step
- [docs/PLAN.md](docs/PLAN.md) — phases, status, known limitations
- [brand/](brand/) — logo SVGs (light/dark, symbol, app icon)
- [CLAUDE.md](CLAUDE.md) — conventions for future development

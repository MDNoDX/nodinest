# Deployment guide ($0)

## Current production (2026-10-12)

- URL: **https://nodinest.vercel.app** — Vercel project `nodinest` (team `mdnodx`), connected to
  GitHub `MDNoDX/nodinest` (every push to `main` deploys).
- Database: **Neon** resource `nodinest-db` (Vercel Marketplace, free) — `DATABASE_URL`
  (pooled) and `DATABASE_URL_UNPOOLED` are injected by the integration. Migrations applied;
  `nodinest_app` RLS role verified through the pooler.
- Env set on Vercel (production): `DB_RLS_ROLE`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `GOOGLE_CLIENT_ID/SECRET`, `SUPERADMIN_EMAILS`, `GEMINI_*`, `AI_DAILY_LIMIT_PER_USER`, `UPLOAD_MAX_MB`.
- Not configured: file storage (no `SUPABASE_*`) → uploads disabled, URL fields work.
- Google console must list the redirect URI
  `https://nodinest.vercel.app/api/auth/callback/google`.
- Migrations against production: `vercel env pull /tmp/.env.prod --environment=production`
  then `DOTENV_PATH=/tmp/.env.prod npm run db:migrate` (delete the file afterwards).

The original Supabase-based guide follows; Neon works the same way (it is plain Postgres).

# Supabase + Google + Gemini + Vercel

Everything below uses free tiers. Limits change; check each dashboard. At the time of
writing: **Supabase Free** — 500 MB database, 1 GB file storage, 5 GB egress, 2 active
projects, **paused after 7 days of inactivity** (data kept; restore from the dashboard), no
backups. **Vercel Hobby** — non-commercial use only, 1M function invocations/month,
function duration up to 300 s. **Gemini API free tier** — per-model RPM/RPD quotas
(Flash-Lite has the most generous daily quota; Pro models are paid-only), resetting at
midnight Pacific time.

## 1. Database (Supabase)

1. Create a project at <https://supabase.com> (choose a region close to your Vercel region).
2. Project → **Connect**:
   - _Transaction pooler_ URI (port **6543**) → `DATABASE_URL` (used by the app).
   - _Session pooler_ or _Direct_ URI (port **5432**) → `DATABASE_URL_UNPOOLED` (migrations).
3. From your machine, apply migrations against Supabase:
   ```bash
   DATABASE_URL_UNPOOLED="postgresql://postgres.<ref>:<password>@<host>:5432/postgres" npm run db:migrate
   DATABASE_URL_UNPOOLED="…same…" npm run db:seed        # optional starter topics
   ```
4. Verify RLS role switching works (Supabase SQL editor):
   ```sql
   select pg_has_role(current_user, 'nodinest_app', 'MEMBER');   -- should be true
   ```
   If false, run `grant nodinest_app to postgres;` once. If your provider cannot grant it,
   set `DB_RLS_ROLE=` (empty) — the app still enforces ownership in code, but RLS is inactive.
5. Tables live in schema `nodinest`, which is **not** exposed by Supabase's Data API. Do not
   add it to "Exposed schemas".

## 2. File storage (optional)

1. Supabase → Storage → **New bucket** `nodinest-files`, **Private** (not public).
2. Project Settings → API → copy the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`
   (server-only; never prefix with `NEXT_PUBLIC_`). `SUPABASE_URL` = project URL.
3. Without these variables uploads are disabled and the UI offers URL fields instead.

## 3. Google sign-in

1. <https://console.cloud.google.com> → APIs & Services → **OAuth consent screen**: External,
   app name "NodiNest", add your email as a test user (or publish the app).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorised JavaScript origins: `https://<your-domain>` (and `http://localhost:3100` for local).
   - Authorised redirect URIs: `https://<your-domain>/api/auth/callback/google`
     (and `http://localhost:3100/api/auth/callback/google`).
3. Copy client ID/secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
4. `SUPERADMIN_EMAILS=mdnodx@gmail.com`. After deployment, sign in with that Google account:
   the superadmin role is assigned automatically (verified Google email + linked Google
   account). Check **Settings → Role** shows "Superadministrator".

## 4. Gemini (optional)

1. <https://aistudio.google.com/apikey> → create an API key (free tier; no billing needed).
2. `GEMINI_API_KEY=…`, `GEMINI_MODEL=gemini-flash-latest`,
   `GEMINI_FALLBACK_MODELS=gemini-flash-lite-latest` (free per-model quotas are tried in order).
3. Do **not** enable billing on that Google Cloud project unless you intend to pay; the app
   never switches to a paid provider by itself. Admin → AI settings controls per-user daily
   limits and which actions the assistant may propose.

## 5. Vercel

1. Push the repository to GitHub (`https://github.com/MDNoDX/nodibook`).
2. <https://vercel.com/new> → import the repo (framework auto-detected: Next.js).
3. Environment variables (Production + Preview as appropriate):

   | Variable                                                                                | Value                                                    |
   | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
   | `DATABASE_URL`                                                                          | Supabase transaction pooler URI (6543)                   |
   | `DATABASE_URL_UNPOOLED`                                                                 | Supabase session/direct URI (only needed for migrations) |
   | `DB_RLS_ROLE`                                                                           | `nodinest_app`                                           |
   | `BETTER_AUTH_SECRET`                                                                    | `openssl rand -base64 32`                                |
   | `BETTER_AUTH_URL`                                                                       | `https://<your-domain>` (no trailing slash)              |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                             | from step 3                                              |
   | `SUPERADMIN_EMAILS`                                                                     | `mdnodx@gmail.com`                                       |
   | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `AI_DAILY_LIMIT_PER_USER`   | step 4                                                   |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `UPLOAD_MAX_MB` | step 2                                                   |

   Never set `ENABLE_DEV_LOGIN` in production (it is ignored there anyway).

4. Project Settings → Functions → set the region closest to your Supabase region.
5. Deploy. For every schema change: run `npm run db:migrate` against Supabase **before**
   promoting the deployment.

## 6. Production smoke test

- [ ] `/login` shows only "Continue with Google" (no developer form).
- [ ] Sign in with `mdnodx@gmail.com` → Settings shows _Superadministrator_; Admin menu visible.
- [ ] Add a person and a book; author autocomplete finds the person while typing.
- [ ] Start/pause/finish a session; Journal shows it; dashboard week total updates.
- [ ] Add a private note; open its URL in a private window with another Google account → 404.
- [ ] Search finds the book and the note (owner only).
- [ ] Switch language EN/UZ and theme light/dark; reload keeps both.
- [ ] Assistant answers (or shows a clear "not configured / quota" message) and proposals
      require confirmation.
- [ ] Upload a cover (if storage configured); `/api/files/<id>` redirects only when signed in.
- [ ] Response headers include CSP and HSTS (`curl -I https://<domain>/login`).

## Local development recap

```bash
cp .env.example .env.local && createdb nodinest && npm run db:migrate && npm run dev
```

Integration tests need a `nodinest_test` database (`TEST_DATABASE_URL` to override);
E2E needs `nodinest_e2e` (`E2E_DATABASE_URL`) and `npx playwright install chromium`.

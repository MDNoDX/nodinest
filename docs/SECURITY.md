# Security model

## Authentication

- Google OAuth via Better Auth; sessions are httpOnly cookies (secure in production), stored
  in `nodinest.session`. Better Auth's own rate limiting is enabled in production.
- The email/password "developer login" exists only when `NODE_ENV !== "production"` **and**
  `ENABLE_DEV_LOGIN=true`; production builds reject sign-up/sign-in on those endpoints
  (verified: `EMAIL_PASSWORD_SIGN_UP_DISABLED`).
- Suspended users cannot create sessions; suspending deletes existing sessions.

## Superadministrator bootstrap

`role` is a server-only column (`input: false`, not updatable by the RLS app role). After
each session is created, `bootstrapSuperadmin` promotes a user **only if**: the email is in
`SUPERADMIN_EMAILS`, it is verified (from Google's `email_verified` claim) **and** a linked
`google` account exists. A dev-login user with the same address is never promoted. Other
changes: Admin → Users (audited, last superadmin protected) or
`npm run admin:grant -- <email>` for operators with database access.

## Authorization (defence in depth)

1. Every page/action/route resolves the actor from the DB (`getCurrentUser`).
2. Services filter by owner and check roles (`assertSuperadmin`).
3. PostgreSQL RLS (`drizzle/0001_search_rls.sql`) under role `nodinest_app`:
   personal tables owner-only; catalog read-all / superadmin-write; notes owner + public
   read; suggestions owner/superadmin; audit insert-own / superadmin-read; auth tables
   inaccessible. Integration tests prove that raw queries without `WHERE` still only see the
   actor's rows, and that writing other users' rows or one's own role fails.
4. Private resources return 404 (not 403) so existence is not leaked.

> If your Postgres provider forbids `SET ROLE`, set `DB_RLS_ROLE=` (empty). The app keeps
> working with application-level checks only; RLS is then inactive. Supabase supports it.

## Input & output

- zod validation on every write (forms, AI tools, suggestion approval) — same schemas.
- SQL is always parameterised (Drizzle `sql` templates). Search tokens are reduced to
  letters/digits before building tsqueries; LIKE wildcards are escaped.
- React escapes output; search highlighting splits strings instead of injecting HTML;
  AI replies are rendered as plain text with a tiny safe formatter.
- Security headers (next.config.ts): CSP (no third-party scripts, `frame-ancestors 'none'`,
  YouTube embeds via youtube-nocookie only), HSTS, X-Frame-Options, nosniff,
  Referrer-Policy, Permissions-Policy. Server actions have built-in Origin checks.

## SSRF protection (URL import / AI `read_url`)

`lib/net/ip.ts` + `lib/net/safe-fetch.ts`: http(s) only, ports 80/443, no credentials, no
`localhost`/`.local`/`.internal`/single-label hosts, IP literals checked; DNS answers are
validated **inside the socket lookup** (all addresses must be public unicast, IPv4-mapped
IPv6 unwrapped, CGNAT/link-local/metadata blocked) so DNS rebinding can't swap the target;
manual redirects (max 3, each re-validated); 10 s timeout; 1.5 MB cap; content-type
allowlist; robots.txt respected; per-user and per-host rate limits; results cached.

## AI safety

- Only explicit tools (`server/ai/tools.ts`), each re-validated with zod. No SQL/shell/code.
- Write tools create proposals; execution requires the user's click and re-checks the
  admin's tool allowlist and the user's current permissions. Catalog edits from AI always
  go to review. Status is `completed` only after the database write succeeded.
- Web content is passed to the model as clearly-labelled untrusted data.
- Per-user burst (8/min) and daily limits (admin-configurable); 429 handling pauses AI
  instead of hammering the API; free-tier model fallbacks only (never a paid provider).
- API keys are server-only env vars and never sent to the browser.

## Files

Private Supabase bucket; uploads use short-lived signed upload URLs issued after type/size/
quota checks; the server verifies the stored object; downloads go through `/api/files/[id]`
(RLS + owner/catalog check) and a 5-minute signed URL. Filenames are sanitised; paths are
random UUIDs.

## Logging

Errors are logged without personal content (`toActionError` logs only the message);
privileged actions are written to `audit_logs`.

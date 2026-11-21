# Backups and restore (Röznoma)

Every day at 03:30 UTC the private repo **MDNoDX/nodinest-backups** runs `.github/workflows/backup.yml`:

| What | Where | How long |
| --- | --- | --- |
| The whole Neon database (`pg_dump -Fc`, AES-256 with `openssl -pbkdf2`) | release `db-YYYY-MM-DD`, asset `nodinest-YYYY-MM-DD.dump.enc` | newest 30 days |
| Every stored file (Netlify Blobs and the Telegram store), AES-256-GCM | `files/<file id>/<n>.bin` + `manifest.json` | mirror (git history keeps older) |

The files come from the site itself: `GET /api/backup/files` and `/api/backup/file?id=&start=`
(`src/server/backup.ts`, CRON_SECRET only, ≤ 4 MB per answer). Audiobook audio is not copied (it can be
voiced again).

Secrets of the backup repo: `DATABASE_URL` (Neon EU, unpooled), `BACKUP_PASSPHRASE`, `CRON_SECRET`,
`SITE_URL`. Set them with `sh scripts/backup-secrets.sh` (reads `.env.netlify`). **The passphrase is in
`.env.netlify`; keep a copy elsewhere too — without it the backups cannot be opened.**

## Restore the database (one command)

Needs `gh`, `openssl` and Postgres 18 tools (`/opt/homebrew/opt/libpq/bin`). `TARGET` is the new,
empty database (create the roles first: `nodinest_app`, see drizzle/0001_search_rls.sql).

```bash
D=$(gh release list --repo MDNoDX/nodinest-backups --limit 1 --json tagName -q '.[0].tagName') && gh release download "$D" --repo MDNoDX/nodinest-backups --pattern '*.dump.enc' --clobber && openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in nodinest-*.dump.enc -out nodinest.dump && pg_restore --no-owner --clean --if-exists -d "$TARGET" nodinest.dump
```

(`export BACKUP_PASSPHRASE=…` and `export TARGET=postgres://…` first.)

## Restore the files

```bash
gh repo clone MDNoDX/nodinest-backups && cd nodinest-backups && BACKUP_PASSPHRASE=… node .github/scripts/restore-files.mjs
```

`./restored/<path>` then holds every file under its `files.path`. To put them into a new blob store,
write each with `putFile(path, bytes, mime)` (`src/server/blob-store.ts`) and mark the rows
`update nodinest.files set bucket = 'blob', tg_parts = null where bucket = 'telegram'` for the ones that
lived in Telegram.

# Baza zaxirasi va tiklash

Har kuni 05:30 (Toshkent) GitHub Actions `DB backup` workflow'i Neon bazasining to'liq nusxasini oladi,
AES-256 bilan shifrlaydi va workflow artefakti sifatida 30 kun saqlaydi (Actions → DB backup → run → Artifacts).
Qo'lda: Actions → DB backup → Run workflow.

Shifr kaliti (`BACKUP_PASSPHRASE`) GitHub secret'ida va lokal `.env.netlify` faylida saqlanadi.

## Tiklash (bitta buyruq)

```bash
gh run download --repo MDNoDX/nodinest -n nodinest-db-<RUN_ID> && gpg -d nodinest-*.dump.gpg > db.dump && pg_restore --no-owner --no-privileges --clean --if-exists -d "$NEW_DATABASE_URL" db.dump
```

`NEW_DATABASE_URL` — yangi (yoki o'sha) Postgres bazasi; Postgres 18 mijozi kerak.
Boshqa hostingga ko'chishda: bazani tiklang, `.env.netlify` dagi qiymatlarni yangi hostingga qo'ying, `DATABASE_URL`ni yangilang.

## Fayllar zaxirasi

Har kuni 08:30 (Toshkent) yopiq **MDNoDX/nodinest-backups** repodagi `backup` workflow'i saytda saqlangan
barcha fayllarni (Netlify Blobs va Telegram ombori) shifrlab (AES-256-GCM) `files/<id>/` ga ko'zgulaydi,
`manifest.json` — id → yo'l, nom, tur, hajm. Fayllar saytning `/api/backup/files` va
`/api/backup/file?id=&start=` manzillaridan olinadi (`src/server/backup.ts`, faqat CRON_SECRET bilan,
har javob ≤ 4 MB). Audiokitob ovozlari ko'chirilmaydi (qayta ovozlatsa bo'ladi).

Bir martalik sozlash (repo papkasida, `.env.netlify` dan o'qiydi, qiymatlar ko'rsatilmaydi):

```bash
sh scripts/backup-secrets.sh
```

Tiklash:

```bash
gh repo clone MDNoDX/nodinest-backups && cd nodinest-backups && BACKUP_PASSPHRASE=… node .github/scripts/restore-files.mjs
```

`./restored/<path>` da har bir fayl `files.path` dagi yo'li bilan turadi. Yangi blob omboriga har birini
`putFile(path, bytes, mime)` (`src/server/blob-store.ts`) bilan yozing; Telegram'da turganlari uchun
`update nodinest.files set bucket = 'blob', tg_parts = null where bucket = 'telegram'`.

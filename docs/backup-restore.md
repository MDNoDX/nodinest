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

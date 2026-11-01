# Röznoma: loyiha xaritasi

Yangi usta shu sahifadan boshlaydi. Har bir narsa qayerda turgani shu yerda yozilgan.

## Papkalar

| Papka | Ichida nima bor |
|---|---|
| `src/` | Saytning o'zi (Next.js) |
| `src/app/` | Sahifalar va API yo'llari |
| `src/server/` | Biznes mantiq va ma'lumotlar bazasi bilan ishlash |
| `src/components/` | Interfeys qismlari, bo'limlar bo'yicha |
| `src/lib/` | Yordamchi kod, serverga bog'liq emas |
| `src/db/` | Baza tuzilishi |
| `messages/` | Tarjimalar: uz, uz-Cyrl (generatsiya qilinadi), ru, en |
| `drizzle/` | Baza migratsiyalari |
| `public/` | Ochiq fayllar: ikonkalar, service worker |
| `tests/` | `unit/`, `integration/`, `e2e/` |
| `scripts/` | Yordamchi buyruqlar: migratsiya, ikonka, tekshiruv |
| `apps/mobile/` | iPhone va Android ilovasi (Capacitor) |
| `apps/windows/` | Windows ilovasi (Electron) |
| `apps/mac/` | Mac ilovasi (Swift) |
| `assets/` | Logotip (`assets/brand/`) va Telegram rasmlari |
| `docs/` | Hujjatlar; eski rejalar `docs/archive/` ichida |

## Qaysi hujjat nima uchun

- `ARCHITECTURE.md`: tizim qanday tuzilgan
- `SCHEMA.md`: baza jadvallari
- `SECURITY.md`: xavfsizlik qoidalari
- `DEPLOYMENT.md`: serverga chiqarish
- `../apps/README.md`: ilovalarni yig'ish va do'konlarga chiqarish
- `../CLAUDE.md`: batafsil texnik qoidalar va qarorlar

## Ishga tushirish

```bash
npm install
npm run dev
```

Tekshiruv: `npm run typecheck && npm run lint && npm test && npm run test:e2e`.

## Eski nom haqida

Mahsulot nomi **Röznoma**. Ombor nomi, baza sxemasi `nodinest`, `nn_*` cookie'lar va
@nodinest_bot boti eski nomda qoldirilgan: ularni o'zgartirish foydalanuvchilarni sessiyasidan
chiqaradi va ma'lumotlarni ko'chirishni talab qiladi.

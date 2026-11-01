# Roznoma ilovalari

Uchala ilova bitta saytni ochadi va unga faqat o'rnatilgan ilova qila oladigan narsalarni
qo'shadi. Sayt yangilansa, ilovani qayta chiqarmasdan hamma yangilanadi.

| Papka | Platforma | Texnologiya | Identifikator |
|---|---|---|---|
| `mobile/ios` | iPhone, iPad | Capacitor 8 | `uz.roznoma.app` |
| `mobile/android` | Android | Capacitor 8 | `uz.roznoma.app` |
| `windows` | Windows 10/11 | Electron | `uz.roznoma.windows` |
| `mac` | macOS | Swift, WKWebView | `app.nodinest.mac` |

## Faqat ilovada bo'ladigan imkoniyatlar

- Reja eslatmalari telefon qulf bo'lsa va internet yo'q bo'lsa ham jiringlaydi: haftalik ro'yxat
  telefonga topshiriladi (`src/lib/native.ts`, `/api/roznoma/upcoming`).
- Google orqali kirish tizim brauzerida bo'ladi va `roznoma://` havolasi bilan ilovaga qaytadi
  (`/app-login?from=mobile`, `/api/app/handoff`).

## Yig'ish

iPhone (Xcode va iOS platformasi kerak):

```bash
xcodebuild -downloadPlatform iOS
cd apps/mobile && npm install && npx cap sync ios && npx cap open ios
```

Android (Android Studio kerak):

```bash
cd apps/mobile && npm install && npx cap sync android && npx cap open android
```

Windows:

```bash
cd apps/windows && npm install && npm run build
```

Mac:

```bash
./apps/mac/build.sh
```

Yig'ilgan fayllar `dist/` ichiga tushadi.

## Do'konga chiqarishdan oldin

Bu ishlarni faqat akkaunt egasi bajara oladi.

1. Domen oling va `capacitor.config.ts`, `apps/windows/main.js`, `offline.html` ichidagi
   `nodinest.vercel.app` manzilini almashtiring. Google Console'ga yangi domenni qo'shing.
2. **Apple Developer** (yiliga 99 $): imzolash, Push Notifications imkoniyati, App Store Connect.
3. **Google Play Console** (bir martalik 25 $): imzo kaliti, ma'lumotlar xavfsizligi anketasi.
4. **Firebase** loyihasi (bepul): masofaviy push uchun. `google-services.json` va APNs kaliti
   qo'shilgach, serverdan push yuborish yoziladi. Hozir ishlaydigani mahalliy eslatmalar.
5. **Windows imzosi**: ixtiyoriy, bo'lmasa SmartScreen ogohlantirish beradi.
6. Do'kon uchun: skrinshotlar, tavsif, `/privacy` havolasi, akkauntni o'chirish yo'li (bor).

Apple faqat saytni o'rab qo'ygan ilovani rad etishi mumkin (4.2-qoida). Bizdagi eslatmalar va
oflayn imkoniyatlar shu xavfni kamaytiradi, lekin kafolat bermaydi.

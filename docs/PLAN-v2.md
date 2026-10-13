# NodiNest v2 — kolleksiya-markazli qayta qurish

Maqsad: NodiNest — o‘qilgan kitoblar, kurslar va videolarning **chiroyli shaxsiy kolleksiyasi**.
Faxrlanib ko‘rsatsa bo‘ladigan muqovalar, aniq ko‘rsatkichlar, kitob bo‘yicha konspekt
va hamma ishni bajara oladigan AI (Jarvis). Vaqt hisoblash (sessiya/taymer) olib tashlanadi.

Mashhur ilovalardan (StoryGraph, Goodreads, Shelfies, Oku) olingan saboqlar: javonlar
(o‘qiyman / o‘qiyapman / o‘qidim), chiroyli muqova devori, yillik maqsad, batafsil
statistika (kitob, sahifa, janr, muallif, yil), sevimlilar va reyting ro‘yxatlari,
nozik baholash (Goodreads’da yarim yulduz yo‘qligi eng ko‘p shikoyat) → **10 ballik baho**.

## Talablar → yechim

| # | Talab | Yechim |
|---|---|---|
| 1, 3 | Sessiya va vaqt hisoblash kerak emas | Jurnal, taymer, sessiyalar, «vaqt kiritish», vaqt statistikasi butunlay olib tashlanadi (jadval ham) |
| 2 | Admin faqat yoqilganda | Bosh admin odatda **oddiy foydalanuvchi** kabi ishlaydi; o‘ng yuqoridagi **«Admin rejimi»** tugmasi yoqilsa barcha admin imkoniyatlari ochiladi. AI har doim cheksiz |
| 2+ | Oddiy foydalanuvchi qulay ishlashi | Har kim katalogga **o‘zi kitob qo‘sha oladi** va o‘zi qo‘shganini tahrirlaydi; boshqalarnikiga o‘zgartirish = taklif |
| 4 | Muqova + o‘qish manbasi | Muqova: havola **yoki** fayl yuklash (Vercel Blob, private). «O‘qish»: PDF yuklash yoki havola; PDF matni sahifalab indekslanadi → qidiruv va AI kitob ichidan topa oladi |
| 5 | Jarvis darajasidagi AI | Kengaytirilgan vositalar: kitob/muallifni internetdan topish (Google Books, Open Library, Wikipedia — muqova bilan), qo‘shish/tahrirlash, muqova qo‘yish, holat/baho/sanalar, to‘plam va reyting, konspekt yozish, kitob ichidan qidirish (sahifa raqami bilan), reja, ko‘rsatkichlar. Shaxsiy va o‘zi qo‘shgan ma’lumotlarga **darhol** bajaradi; o‘chirish/arxiv — tasdiq bilan |
| 6 | Boshlash/tugatish aniq vaqt bilan | `started_at`, `completed_at` — sana + soat:daqiqa |
| 7 | Ortiqcha maydonlar | «Shaxsiy qaydlar», «O‘rganish maqsadlari» olib tashlanadi; «Tashlab qo‘yilgan» → «To‘xtatilgan» ga birlashtiriladi; **Konspekt** — boblar bo‘yicha (chapda mundarija, o‘ngda matn, rasm 1 dagi kabi) + qisqa **Taqriz** |
| 8 | Sanalar chalkash | **Asl nashr (yozilgan) sanasi** + **Men o‘qigan nashr yili**. «Nashr» matn maydoni, sotib olish havolasi, format, mundarija olib tashlanadi |
| 9 | Manbalar sodda | Tasdiqlash va izoh maydonlari olib tashlanadi; «Qo‘shimcha» bo‘limi yig‘ilib turadi, ixtiyoriy |
| 10 | Rejalar | «Shu kundan — shu kungacha» oddiy reja; maqsad = yiliga/oyiga N ta kitob yoki N sahifa |
| 11 | Reytingli to‘plamlar | To‘plamni «Reyting» (Top‑N) qilish mumkin: #1, #2… tartib, yuqoriga/pastga surish. Baho **10 ballik** (darsliklar ham) |
| + | Ko‘rsatkichlar | «Ko‘rsatkichlar» sahifasi: nechta kitob, jami sahifa, nechta kurs/dars, video daqiqalari, yillar bo‘yicha, o‘rtacha baho, sevimli mualliflar/mavzular, eng katta kitob |
| + | Faxrlanish | Bosh sahifa — profil‑kolleksiya: katta raqamlar, o‘qilganlar muqova devori, hozir o‘qilayotganlar, yillik maqsad |

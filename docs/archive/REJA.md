# Roznoma — katta ish rejasi

Egasining barcha talablari bitta joyda, bajarish tartibida. Har bosqich alohida
tekshiriladi va deploy qilinadi. `[Q]` — egasining qarori kerak.

## 0-bosqich. Tiklash va xavfsiz boshlash

- [ ] `1ac8f32` («chala tayyor») commitini tiklash [Q]. Unda: kirill yozuvidagi
      Rejalar/Tahlil yiqilishi tuzatilgan, qisman bajarish, sabab bilan
      o'tkazish, seriya, davomiylikni brauzerda aniqlash, 3D muqovalar,
      Takliflar dizayni, kesh tozalash, profilda ko'rinishni boshqarish.
- [ ] Prod'dagi kirill yiqilishini darhol tuzatish (eng shoshilinch xato).
- [ ] Kalitlar faqat Vercel env'da, repoda hech qachon; ishga tushgach almashtirish.
- [ ] Eslatmalar endpoint'ini maxfiy kalitsiz ishlaydigan qilish.

## 1-bosqich. Kirish, hisob, xavfsizlik

- [ ] Kirish: Google + username/parol + email kod. Telegram orqali kirish olib tashlanadi.
- [ ] Yangi foydalanuvchi: username, ism-familiya (Google'dan olinadi), ixtiyoriy
      telefon, majburiy parol (8+, katta va kichik harf, son; ikki marta; ko'z tugmasi).
- [ ] Vaqt mintaqasi qurilmadan avtomatik.
- [ ] Qurilmalar: ro'yxat, chiqarib tashlash, ko'pi bilan 2 ta.
- [ ] To'liq xavfsizlik auditi: authz, RLS, IDOR, SSRF, XSS, CSRF, rate limit,
      fayl yuklash, webhook, cron, maxfiy ma'lumotlar, sarlavhalar.
- [ ] Bir nechta hisob bilan barcha URL'lar va 4 tilda avtomatik tekshiruv.

## 2-bosqich. Rejalar (eski Röznoma)

- [ ] Bo'lim nomi «Rejalar». Kitob nomi «Röznoma 2026» qoladi.
- [ ] Bo'limlar: Kun, Maqsadlar, Rejalar (arxiv), Tahlil. Menyuda yuqorida.
- [ ] Ish qatori: vaqt chapda (yo'q bo'lsa nuqta), pitichka o'ngda.
- [ ] Holatlar: bajarildi (yashil), qisman 50 % (sarg'ish), bajarilmadi (X),
      kun tugasa avtomatik belgilanadi; chiroyli animatsiya.
- [ ] Ichki bo'limlar (ostida pastki ishlar): yopiq turadi, ochilsa pitichka;
      Qazo → asr, shom, xufton; Mashqlar → alohida mashqlar. Har birining hisobi.
- [ ] Qo'shish: tasnif, boshlanish/tugash vaqti va sanasi (ixtiyoriy), o'lchov
      birligi (bet, daqiqa, soat, ta, marta, «oxirigacha»), ~50 ikonka.
- [ ] Ogohlantirish: tayyor qisqa ovozlar, o'z ovozini yuklash (≤ 10 MB).
- [ ] Kundan olib tashlash = arxiv. Son va vaqti bilan qaytariladi.
      Butunlay o'chirish faqat Rejalar bo'limidan. Tanlab o'chirish.
- [ ] «+ Qo'shish» arxivdan tanlaydi; pastdagi maydon yangisini qo'shadi.
- [ ] Tartiblash sodda; «bosib turing» matnlari yo'q.
- [ ] Yangi hisob uchun default kun va 10 ta ikonkali tayyor reja.
- [ ] Namoz vaqtlari joylashuvga qarab avtomatik (Bomdod va h.k.), qo'lda o'zgaradi.
- [ ] Vaqt: uz/ru 24 soatlik, en AM/PM; qo'lda yozish mumkin.
- [ ] «Kun qanday o'tdi» yopiq turadi. Kitob oyma-oy boblar, kun sarlavhalari;
      bajarilgan rejalar jumla bo'lib tushadi; qo'shish ixtiyoriy.
- [ ] Maqsad: nom, muddat, tur (sport, ilm…), izohli qadamlar, foiz, tabrik
      animatsiyasi, muddat kelganda so'rash, arxiv, eslatmalar.
- [ ] Tahlil: bir oy saqlanadi, har hafta yangilanadi, o'tgan hafta bilan
      solishtirish, kunlik/haftalik maqtov, PDF, botga yuborish. «Eng ko'p
      qoldirilganlar» olib tashlanadi; «kechagidan yaxshi» jumlasi almashadi.
- [ ] Oq/qora rejim, kichik ekranda pastki panel kontentni yopmasligi.

## 3-bosqich. Audiokitob va kitob o'qish

- [ ] Alohida matn tayyorlash yo'q: PDF matni chiroyli ko'rsatiladi, ovoz bilan birga.
- [ ] Global pleer: boshqa bo'limga o'tsa ham davom etadi. Shortcutlar YouTube kabi.
- [ ] Bir marta tayyorlangan ovoz qayta tayyorlanmaydi (brauzer va server kesh).
- [ ] Inglizcha aksent xatosi: namuna va o'qish tilini majburiy belgilash; bir
      nechta dvigatelda solishtirish.
- [ ] To'liq ekranli pleer (Mutolaa namunasi): muqova, tezlik, ±10, taymer, navbat.
- [ ] O'quvchi: to'liq ekran, ikki sahifali varaqlash animatsiyasi, barcha
      ranglarda kontrast (sepiya boblar oq bo'lib ko'rinmay qolgan xato).
- [ ] Darsxonada audiokitob ham kitob qatorida.
- [ ] Muqova formatlari: kitob o'z formati, video 9:16, audio 1:1 disk, hujjat varaq.

## 4-bosqich. Sadik AI va jonli suhbat

- [ ] Yordamchi va Suhbat birlashadi; «Jonli suhbat» tugmasi tepada.
- [ ] Jonli suhbat Gemini Live orqali: to'xtatish mumkin, tilni o'zi aniqlaydi.
- [ ] Faqat Premium; bepulga cheklangan sinov.
- [ ] Ekranda: 3D shar, kartalar, savol-javob, diagramma, formula, reja tahlili, baho.
- [ ] Fayl: PDF, rasm, video; muqova yasash; YouTube tavsiyalari.
- [ ] Xarakter: hazil, qattiqqo'l murabbiy uslubi [Q].
- [ ] Rejalar va xotiraga tayanib odamning xarakterini tushunish.
- [ ] Bosh administrator uchun: statistika, loglar, foydalanuvchi muammolari
      tahlili, hujum va noqonuniy so'rov haqida botga xabar; yozish faqat tasdiq
      bilan. SQL/shell vositasi qo'shilmaydi (loyiha qoidasi).
- [ ] Suhbatlarni tanlab o'chirish (tasdiq bilan). Javobni oqim bilan tezlashtirish.
- [ ] Dvigatellar: asosiy Gemini, zaxira OpenRouter [Q].

## 5-bosqich. Darsxona, manba qo'shish, Takrorlash

- [ ] Turlar: Kitob, Kurs, Maqola, Video, Audio, Fayl, Boshqa; hover/bosishda izoh.
- [ ] «Internetdan topish» yopiq; topilganda maydonlar to'liq to'ladi.
- [ ] Maydonlarda misol matnlar; rollar turga qarab; tafsilotlar yopiq; «Onlayn
      o'qish havolasi» olib tashlanadi; identifikator tushuntiriladi.
- [ ] Sana: raqam bilan yozish, oy kunlari to'g'ri; faqat aniq sana yoki asr.
- [ ] PDF yuklash dizayni. Janrlar qisqaradi (Biografiya bor).
- [ ] Nashriyot/kanal: platforma, kanal, nashriyot, tashkilot; davlat, ochilgan
      sana, asoschi, sayt, tavsif. Shahar olib tashlanadi.
- [ ] Manba qo'shishda ochiq/yopiq.
- [ ] Takrorlash: 5, 10, 20, Maks; Oddiy/Chuqur tanlovi yo'q; takrorlanmaydigan
      savollar; to'plamlarni bo'lim va qidiruv bilan; yodlash tizimi kuchaytiriladi.

## 6-bosqich. Ijtimoiy va bildirishnomalar

- [ ] Profil default ochiq [Q]; yopiq profil ham topiladi, kuzatish so'rov bilan.
- [ ] Bildirishnomalar markazi: kuzatuvchi, so'rov, reja, maqsad, yangilik.
- [ ] Sozlamalar: har turini yoqish/o'chirish, ovoz, Telegram botni ulash (uz, ru, en).
- [ ] Media (lenta): Reels uslubida, odam topish, manbani o'ziga olish, xabar [Q].

## 7-bosqich. Dizayn, ilovalar, yakuniy sinov

- [ ] Yangi rang va gradient tizimi, animatsiyalar, tezlik.
- [ ] Yuqori panelda oq/qora tugmasi; to'liq ekran shortcut.
- [ ] Har bir bo'limga birinchi kirishda alohida qisqa qo'llanma.
- [ ] Ortiqcha matnlarni tozalash; misollar faqat kitob emas.
- [ ] «Klaviatura» → «Shortcutlar». Uzbekcha/ўзбекча til nomlari. Xotira, Takliflar.
- [ ] Qidiruv yaxshilanadi. Logotip, ikonka.
- [ ] Ilovalar: Mac, Windows, Android, iOS [Q].
- [ ] Yakuniy: 0 dan yangi foydalanuvchi sifatida to'liq sinov, tanqidiy baho.

## Keyinga qoldiriladi (egasi aytgan)

Boshqa server, to'lov tizimi, pullik AI.

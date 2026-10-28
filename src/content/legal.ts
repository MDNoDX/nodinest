/**
 * Privacy policy and terms of use (public pages /privacy and /terms).
 * Keep them TRUE to what the code does: when a new service, cookie or kind of
 * data is added, update this file in both languages and bump UPDATED.
 */
export const LEGAL_UPDATED = "2026-10-28";

export type LegalDoc = { title: string; intro: string; sections: { h: string; p: string[] }[] };

const uzPrivacy: LegalDoc = {
  title: "Maxfiylik siyosati",
  intro:
    "NodiNote — o‘qigan, ko‘rgan va o‘rgangan narsalaringiz uchun shaxsiy daftar. Bu sahifa qaysi ma’lumotlaringizni nima uchun saqlashimizni, kimlar ularni qayta ishlashini va ularni qanday o‘chirishingiz mumkinligini oddiy tilda tushuntiradi.",
  sections: [
    {
      h: "Qanday ma’lumotlar saqlanadi",
      p: [
        "Hisob: Google orqali kirsangiz — ismingiz, email manzilingiz va rasmingiz; Telegram orqali kirsangiz — Telegram ID, ism, foydalanuvchi nomi va rasm. Telegram email bermaydi, shuning uchun email o‘rniga ichki belgi saqlanadi.",
        "Siz yaratgan narsalar: kitoblar va manbalar ro‘yxati, o‘qish holati, taqrizlar, qaydlar, iqtiboslar, savol-kartochkalar, maqsadlar, to‘plamlar, AI suhbatlari, yuklagan fayllaringiz (muqovalar, PDF, audio, video).",
        "Texnik ma’lumotlar: sessiya (kirish holati), til va mavzu tanlovi, cheklovlar uchun vaqtincha IP manzil va so‘rovlar soni.",
        "Qurilmangizda (brauzerda) ham ba’zi narsalar saqlanadi: o‘quvchi sozlamalari, taqriz qoralamasi, oflayn saqlangan kitoblar va audiokitob bo‘laklari. Ular serverga yuborilmaydi va chiqishda o‘chiriladi.",
      ],
    },
    {
      h: "Nima uchun",
      p: [
        "Faqat saytning o‘zi ishlashi uchun: kutubxonangizni ko‘rsatish, yozganlaringizni saqlash, qidiruv, statistika, AI yordamchi va audiokitob. Reklama yo‘q, ma’lumotlaringiz sotilmaydi va reklama kuzatuvchilari ishlatilmaydi.",
      ],
    },
    {
      h: "Kimlar qayta ishlaydi",
      p: [
        "Vercel — sayt serveri va fayllar ombori (Vercel Blob). Server Frankfurtda (Germaniya) ishlaydi.",
        "Neon — ma’lumotlar bazasi, Frankfurtda.",
        "Google Gemini API — AI imkoniyatlari: AI ga yozgan savolingiz, tanlagan matn, yuborgan fayl yoki audio, kitob matni (audiokitob va o‘quvchi uchun) Google’ga yuboriladi. Sayt Gemini’ning bepul tarifida ishlaydi; bu tarifda Google yuborilgan ma’lumotlardan o‘z mahsulotlarini yaxshilash uchun foydalanishi mumkin. Shuning uchun AI ga juda shaxsiy yoki maxfiy ma’lumot yubormang.",
        "Google va Telegram — faqat kirish (sizni tanib olish) uchun.",
        "YouTube — siz qo‘shgan videolar youtube-nocookie.com orqali ko‘rsatiladi.",
      ],
    },
    {
      h: "Kimlar ko‘ra oladi",
      p: [
        "Qaydlar, taqrizlar, iqtiboslar, kartochkalar va fayllaringiz sukut bo‘yicha faqat sizga ko‘rinadi.",
        "Katalog (kitob, shaxs, nashriyot yozuvlari) umumiy: siz qo‘shgan katalog yozuvini boshqa foydalanuvchilar ham ko‘radi va tahrir taklif qilishi mumkin. Sizning shaxsiy fikrlaringiz katalogga o‘tmaydi.",
        "Administrator texnik muammolarni hal qilish va qoidabuzarlikni tekshirish uchun zarur bo‘lgandagina ma’lumotlarga murojaat qiladi va bu harakatlar jurnalga yoziladi.",
      ],
    },
    {
      h: "Cookie fayllar",
      p: [
        "Faqat zarur cookie’lar ishlatiladi: kirish sessiyasi, til, mavzu va administrator rejimi. Reklama yoki kuzatuv cookie’lari yo‘q. Tashriflar soni cookie’siz va anonim usulda hisoblanadi.",
      ],
    },
    {
      h: "Saqlash muddati va o‘chirish",
      p: [
        "Ma’lumotlaringiz hisobingiz bor ekan saqlanadi. Sozlamalar → «Hisobni o‘chirish» tugmasi hisobingizni, barcha shaxsiy yozuvlaringizni va fayllaringizni darhol o‘chiradi. Ma’lumotlar bazasining zaxira nusxalarida ular 30 kungacha qolishi mumkin, keyin butunlay yo‘qoladi.",
        "Taqriz va kitoblaringizni istalgan vaqtda eksport qilishingiz (yuklab olishingiz) mumkin. Boshqa ma’lumotlaringiz nusxasi kerak bo‘lsa, Takliflar → «Adminga yozish» orqali so‘rang.",
      ],
    },
    {
      h: "Yosh",
      p: ["Sayt 13 yoshdan katta foydalanuvchilar uchun mo‘ljallangan."],
    },
    {
      h: "O‘zgarishlar va aloqa",
      p: [
        "Siyosat o‘zgarsa, shu sahifa yangilanadi va yuqoridagi sana o‘zgaradi. Savollar bo‘lsa, saytdagi Takliflar → «Adminga yozish» orqali murojaat qiling.",
      ],
    },
  ],
};

const enPrivacy: LegalDoc = {
  title: "Privacy policy",
  intro:
    "NodiNote is a personal notebook for what you read, watch and learn. This page explains in plain words what we keep, why, who processes it and how you can delete it.",
  sections: [
    {
      h: "What is stored",
      p: [
        "Account: with Google — your name, email and picture; with Telegram — your Telegram ID, name, username and picture. Telegram gives no email, so an internal placeholder is stored instead.",
        "What you create: your library and reading status, write-ups, notes, quotes, study cards, goals, collections, AI chats and the files you upload (covers, PDFs, audio, video).",
        "Technical data: your session, language and theme, and — temporarily, for limits — your IP address and request counts.",
        "Some things stay only on your device: reader settings, write-up drafts, books saved offline and audiobook parts. They are not sent to the server and are wiped when you sign out.",
      ],
    },
    {
      h: "Why",
      p: [
        "Only to run the site: to show your library, keep what you write, search, statistics, the AI assistant and audiobooks. There are no ads, your data is not sold and no advertising trackers are used.",
      ],
    },
    {
      h: "Who processes it",
      p: [
        "Vercel — hosting and file storage (Vercel Blob); the server runs in Frankfurt, Germany.",
        "Neon — the database, in Frankfurt.",
        "Google Gemini API — AI features: what you ask, the text you select, files or audio you send and book text (for audiobooks and the reader) are sent to Google. The site uses Gemini’s free tier, where Google may use submitted content to improve its products. Do not send very personal or confidential data to the AI.",
        "Google and Telegram — only to sign you in.",
        "YouTube — videos you add are shown through youtube-nocookie.com.",
      ],
    },
    {
      h: "Who can see it",
      p: [
        "Your notes, write-ups, quotes, cards and files are private by default.",
        "The catalog (books, people, publishers) is shared: entries you add are visible to others, who may suggest edits. Your personal thoughts never go into the catalog.",
        "The administrator accesses data only when needed to fix technical problems or check abuse, and such actions are logged.",
      ],
    },
    {
      h: "Cookies",
      p: [
        "Only necessary cookies: your session, language, theme and admin mode. No advertising or tracking cookies. Visits are counted anonymously without cookies.",
      ],
    },
    {
      h: "Retention and deletion",
      p: [
        "Your data is kept while your account exists. Settings → “Delete account” removes your account, all your personal records and files at once. Database backups may hold them for up to 30 days, after which they are gone for good.",
        "You can export your write-ups and books at any time. For a copy of anything else, ask via Suggestions → “Write to the admin”.",
      ],
    },
    { h: "Age", p: ["The site is meant for users aged 13 and over."] },
    {
      h: "Changes and contact",
      p: [
        "If this policy changes, this page is updated along with the date above. Questions: Suggestions → “Write to the admin” on the site.",
      ],
    },
  ],
};

const uzTerms: LegalDoc = {
  title: "Foydalanish shartlari",
  intro:
    "NodiNote’dan foydalanib, quyidagi oddiy shartlarga rozilik bildirasiz. Ular sizni ham, saytni ham himoya qiladi.",
  sections: [
    {
      h: "Xizmat",
      p: [
        "Sayt bepul va «boricha» taqdim etiladi. U hali rivojlanmoqda: imkoniyatlar o‘zgarishi, vaqtincha ishlamay qolishi mumkin. Muhim yozuvlaringizning nusxasini eksport qilib turing.",
        "AI imkoniyatlari kunlik limit bilan ishlaydi (bepul tarif). AI xato qilishi mumkin: uning javoblari, savollari va audiokitob ovozini tekshirib foydalaning.",
      ],
    },
    {
      h: "Sizning kontentingiz",
      p: [
        "Yozganlaringiz sizniki. Ularni saytda saqlash va sizga ko‘rsatish uchun bizga ruxsat berasiz, xolos.",
        "Faqat foydalanishga haqingiz bo‘lgan fayllarni yuklang. Kitob PDF’lari, audiokitob va o‘quvchi faqat shaxsiy foydalanish uchun: ularni boshqalarga tarqatmang. Mualliflik huquqi buzilganini aytgan murojaat kelsa, tegishli fayl o‘chirilishi mumkin.",
        "Katalogga qo‘shgan yozuvlaringiz (kitob nomi, muallif, nashriyot) umumiy bo‘ladi va boshqalar ularni to‘ldirishi mumkin.",
      ],
    },
    {
      h: "Taqiqlanadi",
      p: [
        "Noqonuniy, haqoratli yoki boshqalarning huquqini buzadigan kontent; saytni buzishga, boshqa hisoblarga kirishga yoki limitlarni chetlab o‘tishga urinish; avtomatik ommaviy so‘rovlar va spam. Bunday holatda hisob to‘xtatilishi mumkin.",
      ],
    },
    {
      h: "Hisob",
      p: [
        "Hisobingiz xavfsizligi uchun Google yoki Telegram akkauntingizni himoya qiling. Hisobni istalgan vaqtda Sozlamalardan o‘chirishingiz mumkin.",
      ],
    },
    {
      h: "Javobgarlik",
      p: [
        "Qonun ruxsat bergan darajada, sayt ma’lumotlar yo‘qolishi yoki AI xatolari tufayli yuzaga kelgan zarar uchun javobgar emas.",
      ],
    },
    {
      h: "O‘zgarishlar",
      p: [
        "Shartlar o‘zgarsa, shu sahifa yangilanadi. Saytdan foydalanishni davom ettirish yangi shartlarga rozilikni bildiradi. Shartlar O‘zbekiston Respublikasi qonunchiligiga muvofiq talqin qilinadi.",
      ],
    },
  ],
};

const enTerms: LegalDoc = {
  title: "Terms of use",
  intro: "By using NodiNote you agree to these simple terms. They protect both you and the site.",
  sections: [
    {
      h: "The service",
      p: [
        "The site is free and provided “as is”. It is still evolving: features may change or be briefly unavailable. Export copies of what matters to you.",
        "AI features have daily limits (free tier). The AI can be wrong: check its answers, questions and audiobook narration.",
      ],
    },
    {
      h: "Your content",
      p: [
        "What you write is yours. You only allow us to store it and show it to you.",
        "Upload only files you have the right to use. Book PDFs, audiobooks and the reader are for personal use: do not distribute them. Files may be removed after a valid copyright complaint.",
        "Catalog entries you add (titles, authors, publishers) become shared and may be completed by others.",
      ],
    },
    {
      h: "Not allowed",
      p: [
        "Illegal or abusive content or content that infringes others’ rights; attempts to break the site, access other accounts or get around limits; automated mass requests and spam. Accounts doing this may be suspended.",
      ],
    },
    {
      h: "Your account",
      p: [
        "Keep your Google or Telegram account secure. You can delete your account in Settings at any time.",
      ],
    },
    {
      h: "Liability",
      p: [
        "To the extent the law allows, the site is not liable for loss of data or for damage caused by AI mistakes.",
      ],
    },
    {
      h: "Changes",
      p: [
        "If these terms change, this page is updated; continuing to use the site means you accept them. These terms are governed by the laws of the Republic of Uzbekistan.",
      ],
    },
  ],
};

export function legalDoc(kind: "privacy" | "terms", locale: string): LegalDoc {
  const en = locale === "en";
  return kind === "privacy" ? (en ? enPrivacy : uzPrivacy) : en ? enTerms : uzTerms;
}

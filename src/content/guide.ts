/**
 * "Qo'llanma": every part of NodiNote explained in plain words, section by
 * section. Shown at /guide (linked from the menu, Settings and the first-visit
 * tour). Kept here rather than in messages/*.json: it is long prose, not UI
 * labels. Both languages must keep the same section ids.
 */
export type GuideItem = { title: string; text: string; tip?: string };
export type GuideSection = {
  id: string;
  icon: string;
  title: string;
  intro: string;
  items: GuideItem[];
  link?: { href: string; label: string };
};

const uz: GuideSection[] = [
  {
    id: "start",
    icon: "rocket",
    title: "Boshlash: 3 qadam",
    intro:
      "NodiNote — o‘qigan, ko‘rgan va o‘rgangan hamma narsangiz uchun shaxsiy daftar. Boshlash uchun shu uch qadam yetarli.",
    items: [
      {
        title: "1. Kitob qo‘shing",
        text: "«Manba qo‘shish» tugmasini bosing. Nomini yozing yoki havolasini qo‘ying (YouTube, kitob sahifasi) — ma’lumotlar o‘zi to‘ldiriladi. Kitob bo‘lsa, uning PDF faylini ham qo‘shing.",
      },
      {
        title: "2. O‘qing yoki tinglang",
        text: "PDF qo‘shilgan kitob sahifasida «O‘qish» va «Audiokitob» tugmalari paydo bo‘ladi. AI kitobni boshidan oxirigacha tahlil qilib, boblarini PDF’dagidek ajratadi.",
      },
      {
        title: "3. Muhim joylarni saqlang",
        text: "O‘qiyotganda matnni belgilang: «Iqtibos» — chiroyli fikrlar uchun, «Qaydnoma» — o‘z fikringiz bilan. Keyin «Takrorlash» bo‘limida AI ulardan savollar tuzib, eslab qolishga yordam beradi.",
        tip: "AI yordamchiga kitob PDF’ini tashlab «shu kitobni qo‘sh» desangiz, hammasini o‘zi qiladi — siz faqat tasdiqlaysiz.",
      },
    ],
  },
  {
    id: "library",
    icon: "library",
    title: "Darsxona",
    intro:
      "Kitoblar, videolar, ma’ruzalar, kurslar, maqolalar va podkastlaringiz. Har bir foydalanuvchining darsxonasi o‘ziniki — boshqalar ko‘rmaydi.",
    items: [
      {
        title: "Manba qo‘shish",
        text: "Turini tanlang, nomini yozing. Havola qo‘ysangiz (YouTube, Wikipedia, kitob sahifasi) muqova, muallif, davomiylik o‘zi olinadi. Kitobning ISBN yoki nomi bo‘yicha internetdan ham qidirish mumkin.",
      },
      {
        title: "Holat: Rejada → O‘qiyapman → O‘qidim",
        text: "Kitob sahifasining o‘ng tomonidagi «Mening o‘qishim» kartasida holatni, bahoni (10 dan) va boshlagan/tugatgan sanalarni belgilang. Sana o‘rniga faqat yil yoki oyni ham yozish mumkin.",
      },
      {
        title: "Saralash va guruhlash",
        text: "Darsxonada turi, janri, holati, o‘qilgan yili yoki yozilgan yili bo‘yicha saralang va guruhlang.",
      },
      {
        title: "Shaxslar, nashriyot va kanallar",
        text: "Darsxona ichidagi yorliqlarda mualliflar, ma’ruzachilar, nashriyotlar va YouTube kanallar. Har birining sahifasida undan nimalarni o‘rganganingiz ko‘rinadi.",
      },
      {
        title: "Dublikatlar",
        text: "Bitta kitob ikki marta qo‘shilsa, «Dublikatlar» sahifasi ularni topib, qaydlaringizni yo‘qotmasdan birlashtiradi.",
      },
    ],
    link: { href: "/library", label: "Darsxonani ochish" },
  },
  {
    id: "reading",
    icon: "book-open",
    title: "Kitobni o‘qish",
    intro:
      "Kitobning PDF faylini qo‘shsangiz, uni saytning o‘zida qulay shaklda o‘qiysiz. Tahrirlash yo‘q — faqat o‘qish, belgilash va o‘rganish.",
    items: [
      {
        title: "Mundarija",
        text: "Boblar PDF’dagidek: o‘z mundarijasi bo‘lsa — aynan o‘sha nomlar bilan (masalan, «Chapter 1 · BRAN»). Xarita va rasmlar o‘z joyida, asl ko‘rinishida chiqadi.",
      },
      {
        title: "Iqtibos va qaydnoma",
        text: "Matnni belgilang — menyu chiqadi. «Iqtibos» iqtiboslaringizga sahifasi bilan saqlanadi (ko‘k rang). «Qaydnoma»da o‘z fikringizni ham yozasiz (sariq rang). Keyin ular kitobda belgilangan holda turadi.",
      },
      {
        title: "AI’dan so‘rash",
        text: "Tushunmagan so‘z yoki joyni belgilab «AI’dan so‘rash»ni bosing: ma’nosi, tarjimasi, kim va qayer ekanligi tushuntiriladi. Kitob haqida umumiy savol ham berishingiz mumkin. AI siz o‘qiyotgan joydan keyingi voqealarni aytmaydi.",
      },
      {
        title: "Ko‘rinish (Aa)",
        text: "Fon (oq, sepiya, tun), shrift, harf o‘lchami, qator oralig‘i va matn kengligini o‘zingizga moslang. Ko‘zni charchatmaslik uchun kechqurun «Tun» yoki «Sepiya» tavsiya qilinadi.",
      },
      {
        title: "Qidiruv va belgilar",
        text: "Yon paneldagi «Qidiruv» kitob ichidan so‘zni topadi, «Belgilar» esa shu kitobdagi barcha iqtibos va qaydlaringiz — bosilsa, o‘sha sahifaga o‘tadi.",
      },
      {
        title: "Internetsiz o‘qish",
        text: "«Internetsiz o‘qish uchun saqlash» kitob matnini qurilmaga yuklaydi — yo‘lda, internet bo‘lmasa ham o‘qiysiz.",
      },
      {
        title: "Qayerda qolganingiz",
        text: "O‘qigan sahifangiz o‘zi saqlanadi va «Mening o‘qishim»dagi progressga yoziladi. Bosh sahifadagi «Davom etish» tugmasi aynan o‘sha joyni ochadi.",
      },
    ],
  },
  {
    id: "audiobook",
    icon: "headphones",
    title: "Audiokitob",
    intro:
      "AI kitobni ovoz chiqarib o‘qib beradi: hikoyachi va har bir qahramon o‘z ovozida, shoshilmasdan, tabiiy pauzalar bilan.",
    items: [
      {
        title: "Tayyorlash",
        text: "Kitob sahifasida «Audiokitob» → «Tayyorlash». AI butun kitobni o‘qib chiqadi: janri, ohangi, qahramonlari (jinsi, yoshi, gapirish uslubi) va qiyin so‘zlar talaffuzi. Bu 1–5 daqiqa oladi.",
      },
      {
        title: "Tinglash",
        text: "Ovoz qismma-qism tayyorlanadi: birinchisi 20–60 soniya, keyingilari siz tinglab turganingizda oldindan tayyorlanadi. Tayyor qismlar qurilmangizda saqlanadi.",
      },
      {
        title: "Tezlik, uyqu taymeri, ovozlar",
        text: "Sukut bo‘yicha tezlik 0,9× — tinch hikoya. Uyqu taymeri ma’lum vaqtdan keyin yoki bob oxirida to‘xtatadi. «Ovozlar» bo‘limida istalgan qahramonning ovozini almashtirish mumkin.",
      },
      {
        title: "Limit",
        text: "Ovoz Google’ning bepul tarifida yaratiladi: butun sayt uchun kuniga taxminan 1–2 soat audio. Limit tugasa, ertaga davom etadi; tayyor qismlar yo‘qolmaydi.",
      },
    ],
  },
  {
    id: "taqriz",
    icon: "pen-line",
    title: "Taqriz",
    intro:
      "Har bir kitob yoki video uchun o‘z fikringizni yozadigan joy — bo‘limlar, iqtiboslar va AI yordami bilan.",
    items: [
      {
        title: "Yozish",
        text: "Kitob sahifasida «Taqriz». Yozganingiz o‘zi saqlanadi (internet uzilsa ham yo‘qolmaydi). Matnni belgilab «Bob qilish» bossangiz — u bo‘lim sarlavhasiga aylanadi va chapdagi mundarijada chiqadi.",
      },
      {
        title: "❝ Iqtibos va 📝 Qaydnoma",
        text: "Belgilangan matnni «Iqtibos» qilsangiz — iqtiboslarga saqlanadi. «Qaydnoma» — qaydlarga saqlanib, taqrizda sariq rang bilan belgilanadi.",
      },
      {
        title: "AI paneli",
        text: "O‘ngdagi panelda AI: belgilangan joyni tushuntiradi, yozishga yordam beradi, video yoki audiodan matn chiqaradi (jonli yoki to‘liq transkript).",
      },
      {
        title: "Video bilan ishlash",
        text: "Video yoki audio pastki pleerda sahifalar almashsa ham o‘ynab turadi. Alt+T — taqrizga hozirgi vaqtni qo‘yadi. Yozayotganingizda pleer o‘zi to‘xtab turadi.",
      },
      {
        title: "Yuklab olish",
        text: "PDF, Word, Markdown, oddiy matn yoki audio-videolari bilan birga (veb-kitob ZIP yoki EPUB).",
      },
    ],
  },
  {
    id: "write",
    icon: "feather",
    title: "Kitob yozish",
    intro:
      "O‘z kitobingizni yozing — masalan, hayotingiz, oilangiz tarixi yoki bilimingiz haqida. Avlodlarga qoladigan eng qimmatli kitob.",
    items: [
      {
        title: "Shablonlar",
        text: "«Hayotim», «Oila tarixi», «Bilim kitobi», «Hikoyalar», «Sayohat kundaligi» — har birida tayyor boblar va yo‘naltiruvchi savollar bor.",
      },
      {
        title: "AI intervyu",
        text: "AI bob mavzusida savol beradi, siz yozasiz yoki gapirasiz — javobingiz chiroyli kitob matniga aylanadi. Yozishni bilmaydigan keksalar uchun ham qulay.",
      },
      {
        title: "Ovoz va video",
        text: "Audio yoki video qo‘shib, uni matnga aylantirish mumkin. Kitobni rasm, audio va videolari bilan yuklab olasiz.",
      },
    ],
    link: { href: "/write", label: "Kitob yozishni boshlash" },
  },
  {
    id: "notes",
    icon: "notebook",
    title: "Qaydlar va iqtiboslar",
    intro: "O‘qish va tinglash paytida saqlagan barcha fikrlaringiz bir joyda.",
    items: [
      {
        title: "Qo‘shish",
        text: "O‘qish yoki taqriz sahifasida matnni belgilab, yoki shu bo‘limda «Yangi qayd» orqali. Iqtibosga muallif va sahifani ham yozing.",
      },
      {
        title: "Qidirish va teglar",
        text: "Teglar bilan guruhlang, yuqoridagi qidiruv bilan bir zumda toping (⌘K / Ctrl+K).",
      },
    ],
  },
  {
    id: "review",
    icon: "brain",
    title: "Takrorlash (yodlash)",
    intro:
      "O‘qiganingiz esdan chiqmasligi uchun: AI eng muhim savollarni tuzadi, tizim esa ularni unutishingizdan sal oldin qayta so‘raydi.",
    items: [
      {
        title: "Savol tuzish",
        text: "Manbalarni tanlang. «Oddiy» — tez; «Chuqur» — imtihon darajasida, har bir javob manbaga solishtirib tekshiriladi. Sonini ham tanlashingiz mumkin (masalan, 100).",
      },
      {
        title: "Takrorlash",
        text: "Har kuni bir necha daqiqa: savolni o‘qing, javobni eslang, o‘zingizni «Qayta / Qiyin / Yaxshi / Oson» deb baholang. Yaxshi bilganlaringiz kamroq, qiyinlari tez-tez chiqadi.",
      },
    ],
    link: { href: "/review", label: "Takrorlashni ochish" },
  },
  {
    id: "assistant",
    icon: "sparkles",
    title: "AI yordamchi",
    intro:
      "Saytning aqlli yordamchisi: oddiy til bilan nima kerakligini ayting. U hech narsani o‘zboshimchalik bilan o‘zgartirmaydi — har bir ish uchun tasdiq kartasi chiqaradi.",
    items: [
      {
        title: "Nimalarni qila oladi",
        text: "Kitob qo‘shish (rasm yoki PDF’dan ham), holat va baho qo‘yish, qayd va iqtibos yozish, savol tuzish, to‘plam yaratish, kitob ichidan qidirish va iqtibos topish, statistikani aytish, audiokitob tayyorlash.",
      },
      {
        title: "Tasdiqlash",
        text: "Har bir o‘zgarish karta bo‘lib chiqadi: «Tasdiqlash» bossangizgina bajariladi. Bir nechta bo‘lsa — «Hammasini tasdiqlash».",
      },
      {
        title: "Kunlik limit",
        text: "AI bepul tarifda ishlaydi, shuning uchun har bir foydalanuvchiga kunlik so‘rovlar soni cheklangan. Limit ertasi kuni yangilanadi.",
      },
    ],
    link: { href: "/assistant", label: "AI yordamchini ochish" },
  },
  {
    id: "more",
    icon: "layers",
    title: "Boshqa bo‘limlar",
    intro: "Kamroq ishlatiladigan, lekin foydali joylar.",
    items: [
      {
        title: "To‘plamlar",
        text: "O‘z ro‘yxatlaringiz: «Top 10 kitob», «Yozda o‘qiyman»… Tartiblangan ro‘yxatda o‘rinlarni ham belgilaysiz.",
      },
      {
        title: "Rejalar va maqsadlar",
        text: "Masalan, «yiliga 24 kitob» yoki «oyiga 1000 sahifa». Progress o‘zi hisoblanadi.",
      },
      {
        title: "Ko‘rsatkichlar",
        text: "Necha kitob, sahifa va soat; eng tez o‘qilganlar; yillar bo‘yicha diagrammalar.",
      },
      {
        title: "Takliflar",
        text: "Adminga xabar yozing: taklif, xato yoki savol. Telegram orqali ham bog‘lanish mumkin.",
      },
      {
        title: "Sozlamalar",
        text: "Til, vaqt mintaqasi, klaviatura tugmalari, pleer sozlamalari, fayllar uchun joy va shu qo‘llanmani qayta ko‘rish.",
      },
    ],
  },
  {
    id: "privacy",
    icon: "shield",
    title: "Maxfiylik",
    intro: "Sizning ma’lumotlaringiz — faqat sizniki.",
    items: [
      {
        title: "Kim nimani ko‘radi",
        text: "Darsxonangiz, qaydlaringiz, taqrizlaringiz, kitob matnlari va o‘qish holatingizni faqat siz ko‘rasiz. Hatto sayt administratori ham shaxsiy qaydlaringizni o‘qiy olmaydi.",
      },
      {
        title: "Fayllar",
        text: "Yuklagan PDF, rasm, audio va videolaringiz yopiq omborda saqlanadi va faqat sizga ochiladi. Chiqqaningizda qurilmadagi nusxalar tozalanadi.",
      },
    ],
  },
  {
    id: "faq",
    icon: "help",
    title: "Ko‘p beriladigan savollar",
    intro: "",
    items: [
      {
        title: "PDF’dan matn chiqmadi — nega?",
        text: "PDF skaner qilingan (rasm) bo‘lsa, unda matn yo‘q. Bunday kitobni audiokitob sifatida tinglash mumkin — AI uni rasmdan o‘qiydi.",
      },
      {
        title: "Audiokitob «limit tugadi» deyapti",
        text: "Bepul ovoz limiti butun sayt uchun kunlik. Ertaga davom etadi; tayyor qismlar saqlangan.",
      },
      {
        title: "Telefonda ilova bormi?",
        text: "Saytni telefon brauzerida oching va «Bosh ekranga qo‘shish»ni bosing — ilova kabi ishlaydi. Mac uchun alohida ilova ham bor.",
      },
      {
        title: "Qo‘llanmani qayta ko‘rish",
        text: "Sozlamalar → «Qo‘llanmani qayta ko‘rish» tanishtiruvni qayta boshlaydi. Bu sahifa esa doim menyuda «Qo‘llanma» nomi bilan turadi.",
      },
    ],
  },
];

const en: GuideSection[] = [
  {
    id: "start",
    icon: "rocket",
    title: "Getting started: 3 steps",
    intro:
      "NodiNote is a personal notebook for everything you read, watch and learn. These three steps are enough to begin.",
    items: [
      {
        title: "1. Add a book",
        text: "Press “Add resource”. Type the title or paste a link (YouTube, a book page) — the details fill in by themselves. For a book, add its PDF too.",
      },
      {
        title: "2. Read or listen",
        text: "A book with its PDF gets “Read” and “Audiobook” buttons. The AI analyses the whole book and splits it into chapters exactly as the PDF does.",
      },
      {
        title: "3. Keep what matters",
        text: "While reading, select text: “Quote” for great lines, “Note” with your own thought. Later, “Review” turns them into questions that help you remember.",
        tip: "Send a book’s PDF to the AI assistant and say “add this book” — it does everything; you only confirm.",
      },
    ],
  },
  {
    id: "library",
    icon: "library",
    title: "Library (Darsxona)",
    intro:
      "Your books, videos, lectures, courses, articles and podcasts. Everyone’s library is their own — nobody else sees it.",
    items: [
      {
        title: "Adding",
        text: "Choose the type and type the title. Paste a link (YouTube, Wikipedia, a book page) and the cover, author and length are taken from it. You can also search books online by title or ISBN.",
      },
      {
        title: "Status: Planned → Reading → Read",
        text: "On the book’s page, the “My reading” card holds the status, the rating (out of 10) and the start / finish dates. A year or a month alone is fine too.",
      },
      {
        title: "Sorting and grouping",
        text: "Sort and group by type, genre, status, the year you read it or the year it was written.",
      },
      {
        title: "People, publishers and channels",
        text: "Tabs inside the library: authors, speakers, publishers and YouTube channels — each page shows what you learned from them.",
      },
      {
        title: "Duplicates",
        text: "If a book was added twice, the Duplicates page finds and merges them without losing your notes.",
      },
    ],
    link: { href: "/library", label: "Open the library" },
  },
  {
    id: "reading",
    icon: "book-open",
    title: "Reading a book",
    intro:
      "Add a book’s PDF and read it right here, comfortably. No editing — reading, marking and learning.",
    items: [
      {
        title: "Contents",
        text: "Chapters exactly as in the PDF: its own contents page, its own names (e.g. “Chapter 1 · BRAN”). Maps and pictures appear in place, as printed.",
      },
      {
        title: "Quotes and notes",
        text: "Select text and a menu appears. “Quote” keeps it with its page (blue). “Note” adds your own thought (amber). Both stay marked in the book.",
      },
      {
        title: "Ask the AI",
        text: "Select a word or passage you don’t understand and press “Ask AI”: meaning, translation, who and where. You can also ask about the book. The AI never reveals what happens after your page.",
      },
      {
        title: "Display (Aa)",
        text: "Paper (white, sepia, night), typeface, size, line spacing and width. Night or sepia are kinder to the eyes in the evening.",
      },
      {
        title: "Search and marks",
        text: "“Search” in the side panel finds words in the book; “Marks” lists all your quotes and notes in it — tap one to jump there.",
      },
      {
        title: "Offline",
        text: "“Save for reading offline” keeps the book’s text on this device for the road.",
      },
      {
        title: "Where you stopped",
        text: "Your page is saved by itself and becomes the progress in “My reading”. “Continue” on the home page opens exactly there.",
      },
    ],
  },
  {
    id: "audiobook",
    icon: "headphones",
    title: "Audiobook",
    intro:
      "The AI reads the book aloud: a narrator and every character in their own voice, unhurried, with natural pauses.",
    items: [
      {
        title: "Preparing",
        text: "Book page → “Audiobook” → “Prepare”. The AI reads the whole book: genre, tone, characters (gender, age, manner of speech) and how hard words are said. Takes 1–5 minutes.",
      },
      {
        title: "Listening",
        text: "The voice is made part by part: the first in 20–60 seconds, the next ones while you listen. Finished parts are kept on your device.",
      },
      {
        title: "Speed, sleep timer, voices",
        text: "Default speed is 0.9× — a calm narration. The sleep timer stops after a while or at the end of a chapter. Change any character’s voice under “Voices”.",
      },
      {
        title: "Limit",
        text: "Voices are made on Google’s free tier: about 1–2 hours of audio a day for the whole site. When it runs out, it continues tomorrow; finished parts are kept.",
      },
    ],
  },
  {
    id: "taqriz",
    icon: "pen-line",
    title: "Write-up (Taqriz)",
    intro:
      "A place for your own thoughts on each book or video — with chapters, quotes and AI help.",
    items: [
      {
        title: "Writing",
        text: "Book page → “Taqriz”. It saves by itself (even offline). Select text and press “Make chapter” to turn it into a heading in the outline.",
      },
      {
        title: "❝ Quote and 📝 Note",
        text: "“Quote” keeps the selection in your quotes. “Note” keeps it in your notes and marks it amber in the write-up.",
      },
      {
        title: "AI panel",
        text: "On the right: explains a selection, helps you write, turns a video or audio into text (live or a full transcript).",
      },
      {
        title: "With a video",
        text: "The player keeps playing across pages. Alt+T stamps the current time into the write-up. It pauses itself while you type.",
      },
      {
        title: "Download",
        text: "PDF, Word, Markdown, plain text, or with its audio and video (web book ZIP or EPUB).",
      },
    ],
  },
  {
    id: "write",
    icon: "feather",
    title: "Writing a book",
    intro:
      "Write your own book — your life, your family’s story or what you know. The most precious book for the next generations.",
    items: [
      {
        title: "Templates",
        text: "“My life”, “Family history”, “A book of knowledge”, “Stories”, “Travel diary” — each with ready chapters and guiding questions.",
      },
      {
        title: "AI interview",
        text: "The AI asks about the chapter; you type or speak — your answer becomes book text. Great for grandparents who don’t like typing.",
      },
      {
        title: "Voice and video",
        text: "Add audio or video and turn it into text. Download the book with its pictures, audio and video.",
      },
    ],
    link: { href: "/write", label: "Start a book" },
  },
  {
    id: "notes",
    icon: "notebook",
    title: "Notes and quotes",
    intro: "Every thought you kept while reading and listening, in one place.",
    items: [
      {
        title: "Adding",
        text: "Select text while reading or writing, or press “New note” here. Give a quote its author and page.",
      },
      {
        title: "Search and tags",
        text: "Group with tags; find anything at once with the search at the top (⌘K / Ctrl+K).",
      },
    ],
  },
  {
    id: "review",
    icon: "brain",
    title: "Review (remembering)",
    intro:
      "So you don’t forget what you read: the AI writes the important questions, and you see each one just before you would forget it.",
    items: [
      {
        title: "Making questions",
        text: "Pick the sources. “Standard” is quick; “Deep” is exam level and every answer is checked against the source. You can choose how many (e.g. 100).",
      },
      {
        title: "Reviewing",
        text: "A few minutes a day: read the question, recall the answer, grade yourself (Again / Hard / Good / Easy). What you know well comes back rarely, the hard ones often.",
      },
    ],
    link: { href: "/review", label: "Open Review" },
  },
  {
    id: "assistant",
    icon: "sparkles",
    title: "AI assistant",
    intro:
      "Say what you need in plain words. It never changes anything on its own — every action is a card you confirm.",
    items: [
      {
        title: "What it can do",
        text: "Add books (from a photo or a PDF too), set status and rating, write notes and quotes, make questions, build collections, search inside books, tell your stats, prepare audiobooks.",
      },
      {
        title: "Confirming",
        text: "Every change appears as a card and runs only when you press “Confirm”. Several at once — “Confirm all”.",
      },
      {
        title: "Daily limit",
        text: "The AI runs on a free tier, so each user has a number of requests a day. It renews the next day.",
      },
    ],
    link: { href: "/assistant", label: "Open the assistant" },
  },
  {
    id: "more",
    icon: "layers",
    title: "Other sections",
    intro: "Used less often, but useful.",
    items: [
      {
        title: "Collections",
        text: "Your own lists: “Top 10 books”, “Summer reading”… Ranked lists keep places.",
      },
      {
        title: "Plans and goals",
        text: "E.g. “24 books a year” or “1000 pages a month”. Progress counts itself.",
      },
      { title: "Stats", text: "Books, pages and hours; fastest reads; charts by year." },
      {
        title: "Suggestions",
        text: "Write to the admin: an idea, a bug, a question. Telegram works too.",
      },
      {
        title: "Settings",
        text: "Language, time zone, keyboard shortcuts, the player, your storage, and replaying the tour.",
      },
    ],
  },
  {
    id: "privacy",
    icon: "shield",
    title: "Privacy",
    intro: "Your data is yours alone.",
    items: [
      {
        title: "Who sees what",
        text: "Only you see your library, notes, write-ups, book texts and reading status. Even the site admin cannot read your private notes.",
      },
      {
        title: "Files",
        text: "Your PDFs, pictures, audio and video are in a private store, opened only for you. Copies on the device are cleared when you sign out.",
      },
    ],
  },
  {
    id: "faq",
    icon: "help",
    title: "Frequent questions",
    intro: "",
    items: [
      {
        title: "No text came out of my PDF — why?",
        text: "A scanned PDF (pictures) has no text layer. You can still listen to it as an audiobook — the AI reads the images.",
      },
      {
        title: "The audiobook says the limit is reached",
        text: "The free voice limit is daily, for the whole site. It continues tomorrow; finished parts are kept.",
      },
      {
        title: "Is there a phone app?",
        text: "Open the site in your phone’s browser and choose “Add to Home Screen” — it works like an app. There is a Mac app too.",
      },
      {
        title: "Seeing the tour again",
        text: "Settings → “Replay the tour”. This page is always in the menu as “Guide”.",
      },
    ],
  },
];

export function guideFor(locale: string): GuideSection[] {
  return locale === "en" ? en : uz;
}

/**
 * "Qo'llanma": every part of NodiNote explained in plain words, section by
 * section. Shown at /guide (linked from the menu, Settings and the first-visit
 * tour). Kept here rather than in messages/*.json: it is long prose, not UI
 * labels. Both languages must keep the same section ids.
 */
import { ru } from "./guide-ru";

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
    title: "Boşlaş: 3 qadam",
    intro:
      "NodiNote — öqigan, körgan va örgangan hamma narsangiz uçun şaxsiy daftar. Boşlaş uçun şu uç qadam yetarli.",
    items: [
      {
        title: "1. Kitob qöşing",
        text: "«Manba qöşiş» tugmasini bosing. Nomini yozing yoki havolasini qöying (YouTube, kitob sahifasi) — ma’lumotlar özi töldiriladi. Kitob bölsa, uning PDF faylini ham qöşing.",
      },
      {
        title: "2. Öqing yoki tinglang",
        text: "PDF qöşilgan kitob sahifasida «Öqiş» va «Audiokitob» tugmalari paydo böladi. AI kitobni boşidan oxirigaça tahlil qilib, boblarini PDF’dagidek ajratadi.",
      },
      {
        title: "3. Muhim joylarni saqlang",
        text: "Öqiyotganda matnni belgilang: «Iqtibos» — çiroyli fikrlar uçun, «Qaydnoma» — öz fikringiz bilan. Keyin «Takrorlaş» bölimida AI ulardan savollar tuzib, eslab qolişga yordam beradi.",
        tip: "AI yordamçiga kitob PDF’ini taşlab «şu kitobni qöş» desangiz, hammasini özi qiladi — siz faqat tasdiqlaysiz.",
      },
    ],
  },
  {
    id: "library",
    icon: "library",
    title: "Darsxona",
    intro:
      "Kitoblar, videolar, ma’ruzalar, kurslar, maqolalar va podkastlaringiz. Har bir foydalanuvçining darsxonasi öziniki — boşqalar körmaydi.",
    items: [
      {
        title: "Manba qöşiş",
        text: "Turini tanlang, nomini yozing. Havola qöysangiz (YouTube, Wikipedia, kitob sahifasi) muqova, muallif, davomiylik özi olinadi. Kitobning ISBN yoki nomi böyiça internetdan ham qidiriş mumkin.",
      },
      {
        title: "Holat: Rejada → Öqiyapman → Öqidim",
        text: "Kitob sahifasining öng tomonidagi «Mening öqişim» kartasida holatni, bahoni (10 dan) va boşlagan/tugatgan sanalarni belgilang. Sana örniga faqat yil yoki oyni ham yoziş mumkin.",
      },
      {
        title: "Saralaş va guruhlaş",
        text: "Darsxonada turi, janri, holati, öqilgan yili yoki yozilgan yili böyiça saralang va guruhlang.",
      },
      {
        title: "Şaxslar, naşriyot va kanallar",
        text: "Darsxona içidagi yorliqlarda mualliflar, ma’ruzaçilar, naşriyotlar va YouTube kanallar. Har birining sahifasida undan nimalarni örganganingiz körinadi.",
      },
      {
        title: "Dublikatlar",
        text: "Bitta kitob ikki marta qöşilsa, «Dublikatlar» sahifasi ularni topib, qaydlaringizni yöqotmasdan birlaştiradi.",
      },
    ],
    link: { href: "/library", label: "Darsxonani oçiş" },
  },
  {
    id: "reading",
    icon: "book-open",
    title: "Kitobni öqiş",
    intro:
      "Kitobning PDF faylini qöşsangiz, uni saytning özida qulay şaklda öqiysiz. Tahrirlaş yöq — faqat öqiş, belgilaş va örganiş.",
    items: [
      {
        title: "Mundarija",
        text: "Boblar PDF’dagidek: öz mundarijasi bölsa — aynan öşa nomlar bilan (masalan, «Chapter 1 · BRAN»). Xarita va rasmlar öz joyida, asl körinişida çiqadi.",
      },
      {
        title: "Iqtibos va qaydnoma",
        text: "Matnni belgilang — menyu çiqadi. «Iqtibos» iqtiboslaringizga sahifasi bilan saqlanadi (kök rang). «Qaydnoma»da öz fikringizni ham yozasiz (sariq rang). Keyin ular kitobda belgilangan holda turadi.",
      },
      {
        title: "AI’dan söraş",
        text: "Tuşunmagan söz yoki joyni belgilab «AI’dan söraş»ni bosing: ma’nosi, tarjimasi, kim va qayer ekanligi tuşuntiriladi. Kitob haqida umumiy savol ham berişingiz mumkin. AI siz öqiyotgan joydan keyingi voqealarni aytmaydi.",
      },
      {
        title: "Köriniş (Aa)",
        text: "Fon (oq, sepiya, tun), şrift, harf ölçami, qator oraliği va matn kengligini özingizga moslang. Közni çarçatmaslik uçun keçqurun «Tun» yoki «Sepiya» tavsiya qilinadi.",
      },
      {
        title: "Qidiruv va belgilar",
        text: "Yon paneldagi «Qidiruv» kitob içidan sözni topadi, «Belgilar» esa şu kitobdagi barça iqtibos va qaydlaringiz — bosilsa, öşa sahifaga ötadi.",
      },
      {
        title: "Internetsiz öqiş",
        text: "«Internetsiz öqiş uçun saqlaş» kitob matnini qurilmaga yuklaydi — yölda, internet bölmasa ham öqiysiz.",
      },
      {
        title: "Qayerda qolganingiz",
        text: "Öqigan sahifangiz özi saqlanadi va «Mening öqişim»dagi progressga yoziladi. Boş sahifadagi «Davom etiş» tugmasi aynan öşa joyni oçadi.",
      },
    ],
  },
  {
    id: "audiobook",
    icon: "headphones",
    title: "Audiokitob",
    intro:
      "AI kitobni ovoz çiqarib öqib beradi: hikoyaçi va har bir qahramon öz ovozida, şoşilmasdan, tabiiy pauzalar bilan.",
    items: [
      {
        title: "Tayyorlaş",
        text: "Kitob sahifasida «Audiokitob» → «Tayyorlaş». AI butun kitobni öqib çiqadi: janri, ohangi, qahramonlari (jinsi, yoşi, gapiriş uslubi) va qiyin sözlar talaffuzi. Bu 1–5 daqiqa oladi.",
      },
      {
        title: "Tinglaş",
        text: "Ovoz qismma-qism tayyorlanadi: birinçisi 20–60 soniya, keyingilari siz tinglab turganingizda oldindan tayyorlanadi. Tayyor qismlar qurilmangizda saqlanadi.",
      },
      {
        title: "Tezlik, uyqu taymeri, ovozlar",
        text: "Sukut böyiça tezlik 0,9× — tinç hikoya. Uyqu taymeri ma’lum vaqtdan keyin yoki bob oxirida töxtatadi. «Ovozlar» bölimida istalgan qahramonning ovozini almaştiriş mumkin.",
      },
      {
        title: "Limit",
        text: "Ovoz Google’ning bepul tarifida yaratiladi: butun sayt uçun kuniga taxminan 1–2 soat audio. Limit tugasa, ertaga davom etadi; tayyor qismlar yöqolmaydi.",
      },
    ],
  },
  {
    id: "taqriz",
    icon: "pen-line",
    title: "Taqriz",
    intro:
      "Har bir kitob yoki video uçun öz fikringizni yozadigan joy — bölimlar, iqtiboslar va AI yordami bilan.",
    items: [
      {
        title: "Yoziş",
        text: "Kitob sahifasida «Taqriz». Yozganingiz özi saqlanadi (internet uzilsa ham yöqolmaydi). Matnni belgilab «Bob qiliş» bossangiz — u bölim sarlavhasiga aylanadi va çapdagi mundarijada çiqadi.",
      },
      {
        title: "❝ Iqtibos va 📝 Qaydnoma",
        text: "Belgilangan matnni «Iqtibos» qilsangiz — iqtiboslarga saqlanadi. «Qaydnoma» — qaydlarga saqlanib, taqrizda sariq rang bilan belgilanadi.",
      },
      {
        title: "AI paneli",
        text: "Öngdagi panelda AI: belgilangan joyni tuşuntiradi, yozişga yordam beradi, video yoki audiodan matn çiqaradi (jonli yoki töliq transkript).",
      },
      {
        title: "Video bilan işlaş",
        text: "Video yoki audio pastki pleerda sahifalar almaşsa ham öynab turadi. Alt+T — taqrizga hozirgi vaqtni qöyadi. Yozayotganingizda pleer özi töxtab turadi.",
      },
      {
        title: "Yuklab oliş",
        text: "PDF, Word, Markdown, oddiy matn yoki audio-videolari bilan birga (veb-kitob ZIP yoki EPUB).",
      },
    ],
  },
  {
    id: "write",
    icon: "feather",
    title: "Kitob yoziş",
    intro:
      "Öz kitobingizni yozing — masalan, hayotingiz, oilangiz tarixi yoki bilimingiz haqida. Avlodlarga qoladigan eng qimmatli kitob.",
    items: [
      {
        title: "Şablonlar",
        text: "«Hayotim», «Oila tarixi», «Bilim kitobi», «Hikoyalar», «Sayohat kundaligi» — har birida tayyor boblar va yönaltiruvçi savollar bor.",
      },
      {
        title: "AI intervyu",
        text: "AI bob mavzusida savol beradi, siz yozasiz yoki gapirasiz — javobingiz çiroyli kitob matniga aylanadi. Yozişni bilmaydigan keksalar uçun ham qulay.",
      },
      {
        title: "Ovoz va video",
        text: "Audio yoki video qöşib, uni matnga aylantiriş mumkin. Kitobni rasm, audio va videolari bilan yuklab olasiz.",
      },
    ],
    link: { href: "/write", label: "Kitob yozişni boşlaş" },
  },
  {
    id: "notes",
    icon: "notebook",
    title: "Qaydlar va iqtiboslar",
    intro: "Öqiş va tinglaş paytida saqlagan barça fikrlaringiz bir joyda.",
    items: [
      {
        title: "Qöşiş",
        text: "Öqiş yoki taqriz sahifasida matnni belgilab, yoki şu bölimda «Yangi qayd» orqali. Iqtibosga muallif va sahifani ham yozing.",
      },
      {
        title: "Qidiriş va teglar",
        text: "Teglar bilan guruhlang, yuqoridagi qidiruv bilan bir zumda toping (⌘K / Ctrl+K).",
      },
    ],
  },
  {
    id: "review",
    icon: "brain",
    title: "Takrorlaş (yodlaş)",
    intro:
      "Öqiganingiz esdan çiqmasligi uçun: AI eng muhim savollarni tuzadi, tizim esa ularni unutişingizdan sal oldin qayta söraydi.",
    items: [
      {
        title: "Savol tuziş",
        text: "Manbalarni tanlang. «Oddiy» — tez; «Çuqur» — imtihon darajasida, har bir javob manbaga soliştirib tekşiriladi. Sonini ham tanlaşingiz mumkin (masalan, 100).",
      },
      {
        title: "Takrorlaş",
        text: "Har kuni bir neça daqiqa: savolni öqing, javobni eslang, özingizni «Qayta / Qiyin / Yaxşi / Oson» deb baholang. Yaxşi bilganlaringiz kamroq, qiyinlari tez-tez çiqadi.",
      },
    ],
    link: { href: "/review", label: "Takrorlaşni oçiş" },
  },
  {
    id: "assistant",
    icon: "sparkles",
    title: "AI yordamçi",
    intro:
      "Saytning aqlli yordamçisi: oddiy til bilan nima kerakligini ayting. U heç narsani özboşimçalik bilan özgartirmaydi — har bir iş uçun tasdiq kartasi çiqaradi.",
    items: [
      {
        title: "Nimalarni qila oladi",
        text: "Kitob qöşiş (rasm yoki PDF’dan ham), holat va baho qöyiş, qayd va iqtibos yoziş, savol tuziş, töplam yaratiş, kitob içidan qidiriş va iqtibos topiş, statistikani aytiş, audiokitob tayyorlaş.",
      },
      {
        title: "Tasdiqlaş",
        text: "Har bir özgariş karta bölib çiqadi: «Tasdiqlaş» bossangizgina bajariladi. Bir neçta bölsa — «Hammasini tasdiqlaş».",
      },
      {
        title: "Kunlik limit",
        text: "AI bepul tarifda işlaydi, şuning uçun har bir foydalanuvçiga kunlik sörovlar soni çeklangan. Limit ertasi kuni yangilanadi.",
      },
    ],
    link: { href: "/assistant", label: "AI yordamçini oçiş" },
  },
  {
    id: "more",
    icon: "layers",
    title: "Boşqa bölimlar",
    intro: "Kamroq işlatiladigan, lekin foydali joylar.",
    items: [
      {
        title: "Töplamlar",
        text: "Öz röyxatlaringiz: «Top 10 kitob», «Yozda öqiyman»… Tartiblangan röyxatda örinlarni ham belgilaysiz.",
      },
      {
        title: "Rejalar va maqsadlar",
        text: "Masalan, «yiliga 24 kitob» yoki «oyiga 1000 sahifa». Progress özi hisoblanadi.",
      },
      {
        title: "Körsatkiçlar",
        text: "Neça kitob, sahifa va soat; eng tez öqilganlar; yillar böyiça diagrammalar.",
      },
      {
        title: "Takliflar",
        text: "Adminga xabar yozing: taklif, xato yoki savol. Telegram orqali ham boğlaniş mumkin.",
      },
      {
        title: "Sozlamalar",
        text: "Til, vaqt mintaqasi, klaviatura tugmalari, pleer sozlamalari, fayllar uçun joy va şu qöllanmani qayta köriş.",
      },
    ],
  },
  {
    id: "community",
    icon: "users",
    title: "Hamjamiyat",
    intro: "Boşqa öquvçilarni kuzating, öqituvçi öquvçilarining faoliyatini körib tursin.",
    items: [
      {
        title: "Profil — yopiq yoki oçiq",
        text: "Sukut böyiça profilingiz yopiq: hamma narsa faqat sizga körinadi. Sozlamalar → Profil körinişi böliminda uni oçiq qilsangiz, boşqalar sizni ism yoki @username böyiça topadi.",
        tip: "Profilni yopsangiz, hamma narsa darhol yaşiriladi.",
      },
      {
        title: "Darslikni oçiq qiliş",
        text: "Kitob sahifasida «Yopiq / Oçiq» tugmasi bor. Oçiq darslik profilingizda nomi, holati va bahosi bilan körinadi. Qaydlar, taqrizlar va fayllar hech qaçon körinmaydi.",
      },
      {
        title: "Kuzatiş va özingizga olish",
        text: "Birovning profilida «Kuzatiş»ni bosing — uning yangi öqiganlari Hamjamiyat sahifasida çiqadi. Yoqqan kitobni oçib, holatini tanlasangiz, u sizning Darsxonangizga qöşiladi.",
      },
    ],
    link: { href: "/community", label: "Hamjamiyatni oçiş" },
  },
  {
    id: "premium",
    icon: "badge",
    title: "Premium",
    intro: "Köproq AI, audiokitoblar va reklamasiz ish.",
    items: [
      {
        title: "Nimalar kiradi",
        text: "Premium’da kuniga köproq AI sörovi, audiokitob tayyorlaş, AI takrorlaş savollari, uzunroq video/audio konspekt va reklamasiz ekran bor. Aniq limitlar Premium sahifasida yozilgan.",
      },
      {
        title: "Qanday ulanadi",
        text: "Premium sahifasidagi kartaga yoki Payme / Click orqali tölang, keyin «Tölov qildim» formasini yuboring. Admin tekşirgaç Premium özi yoqiladi va ismingiz yonida kök belgi paydo böladi.",
      },
    ],
    link: { href: "/premium", label: "Premium sahifasi" },
  },
  {
    id: "telegram",
    icon: "send",
    title: "Telegram bot",
    intro: "@nodinest_bot — kiriş, takliflar va javoblar uçun.",
    items: [
      {
        title: "Telegram orqali kiriş",
        text: "Kiriş sahifasida «Telegram orqali kiriş»ni bosing: bot oçiladi, «Tasdiqlaş»ni bosasiz — tamom. Telefon raqami yoki SMS kod kerak emas.",
      },
      {
        title: "Botga yozing",
        text: "Botga istalgan taklif yoki savolni yozing — u adminga boradi, javob esa botga va saytdagi Takliflar böliminga keladi.",
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
        title: "Kim nimani köradi",
        text: "Darsxonangiz, qaydlaringiz, taqrizlaringiz, kitob matnlari va öqiş holatingizni faqat siz körasiz. Hatto sayt administratori ham şaxsiy qaydlaringizni öqiy olmaydi.",
      },
      {
        title: "Fayllar",
        text: "Yuklagan PDF, rasm, audio va videolaringiz yopiq omborda saqlanadi va faqat sizga oçiladi. Çiqqaningizda qurilmadagi nusxalar tozalanadi.",
      },
    ],
  },
  {
    id: "faq",
    icon: "help",
    title: "Köp beriladigan savollar",
    intro: "",
    items: [
      {
        title: "PDF’dan matn çiqmadi — nega?",
        text: "PDF skaner qilingan (rasm) bölsa, unda matn yöq. Bunday kitobni audiokitob sifatida tinglaş mumkin — AI uni rasmdan öqiydi.",
      },
      {
        title: "Audiokitob «limit tugadi» deyapti",
        text: "Bepul ovoz limiti butun sayt uçun kunlik. Ertaga davom etadi; tayyor qismlar saqlangan.",
      },
      {
        title: "Telefonda ilova bormi?",
        text: "Saytni telefon brauzerida oçing va «Boş ekranga qöşiş»ni bosing — ilova kabi işlaydi. Mac uçun alohida ilova ham bor.",
      },
      {
        title: "Qöllanmani qayta köriş",
        text: "Sozlamalar → «Qöllanmani qayta köriş» taniştiruvni qayta boşlaydi. Bu sahifa esa doim menyuda «Qöllanma» nomi bilan turadi.",
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
    id: "community",
    icon: "users",
    title: "Community",
    intro: "Follow other learners; a teacher can follow students’ progress.",
    items: [
      {
        title: "Profile — private or public",
        text: "Your profile is private by default: everything is visible only to you. Make it public in Settings → Profile visibility and others can find you by name or @username.",
        tip: "Make the profile private again and everything is hidden at once.",
      },
      {
        title: "Making a lesson public",
        text: "A book’s page has a “Private / Public” button. Public items show on your profile with their title, status and rating. Notes, write-ups and files are never shown.",
      },
      {
        title: "Follow and take it yourself",
        text: "Press “Follow” on someone’s profile — what they read next appears on the Community page. Open a book you like and pick a status: it joins your own library.",
      },
    ],
    link: { href: "/community", label: "Open Community" },
  },
  {
    id: "premium",
    icon: "badge",
    title: "Premium",
    intro: "More AI, audiobooks and no ads.",
    items: [
      {
        title: "What is included",
        text: "Premium has more AI requests a day, audiobooks, AI study questions, longer video/audio notes and no ads. The exact limits are on the Premium page.",
      },
      {
        title: "How to get it",
        text: "Pay to the card on the Premium page or with Payme / Click, then send the “I have paid” form. Once the admin checks it, Premium turns on and a blue tick appears next to your name.",
      },
    ],
    link: { href: "/premium", label: "The Premium page" },
  },
  {
    id: "telegram",
    icon: "send",
    title: "Telegram bot",
    intro: "@nodinest_bot — sign-in, suggestions and answers.",
    items: [
      {
        title: "Sign in with Telegram",
        text: "Press “Continue with Telegram” on the sign-in page: the bot opens, you press “Confirm” — done. No phone number or SMS code.",
      },
      {
        title: "Write to the bot",
        text: "Send any suggestion or question to the bot — it goes to the admin, and the answer comes back to the bot and to Suggestions on the site.",
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
  return locale === "en" ? en : locale === "ru" ? ru : uz;
}

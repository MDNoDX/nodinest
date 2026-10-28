/**
 * Privacy policy and terms of use (public pages /privacy and /terms), written
 * for the user: what is kept, why, who sees it, how to delete it, contact.
 * Keep them TRUE when new kinds of data are collected, and bump LEGAL_UPDATED.
 */
export const LEGAL_UPDATED = "2026-10-28";
export const CONTACT_EMAIL = "mdnodx@gmail.com";

export type LegalDoc = { title: string; intro: string; sections: { h: string; p: string[] }[] };

const uzPrivacy: LegalDoc = {
  title: "Maxfiylik siyosati",
  intro:
    "NodiNote — öqigan, körgan va örgangan narsalaringiz uçun şaxsiy daftar. Bu yerda qaysi ma’lumotlaringiz saqlanişi, ularni kim körişi va qanday öçirişingiz mumkinligi oddiy tilda yozilgan.",
  sections: [
    {
      h: "Nima saqlanadi",
      p: [
        "Hisobingiz: ism, familiya, foydalanuvçi nomi (username) va rasm. Google orqali kirsangiz — email manzilingiz ham; Telegram orqali kirsangiz — Telegram ID raqamingiz.",
        "Siz yaratgan narsalar: kitoblar röyxati va öqiş holati, taqrizlar, qaydlar, iqtiboslar, savol-kartoçkalar, maqsadlar, töplamlar, AI suhbatlari va yuklagan fayllaringiz.",
        "Botga yoki «Adminga yoziş» orqali yuborgan xabarlaringiz.",
      ],
    },
    {
      h: "Nima uçun",
      p: [
        "Faqat sayt sizga xizmat qilişi uçun: kutubxonangizni körsatiş, yozganlaringizni saqlaş, qidiruv, statistika, AI yordamçi va audiokitob. Reklama yöq, ma’lumotlaringiz sotilmaydi va heç kimga berilmaydi.",
      ],
    },
    {
      h: "Kim köra oladi",
      p: [
        "Qaydlar, taqrizlar, iqtiboslar, kartoçkalar va fayllaringiz faqat sizga körinadi. Katta fayllar şifrlangan holda saqlanadi.",
        "Siz yuklagan kitob va undan tayyorlangan audiokitob boşqalarga berilmaydi. Faqat qonuniy nusxalarni yuklang va ularni tarqatmang (Foydalaniş şartlariga qarang).",
        "Profilingiz sukut böyiça yopiq. Uni oçiq qilsangiz, boşqalar ismingiz, rasmingiz, username va «oçiq» deb belgilagan darsliklaringizni (nomi, holati, bahosi) köradi va sizni kuzatişi mumkin. Profilni yopsangiz, hammasi darhol yaşiriladi.",
        "Premium uçun tölov sörovida yozgan summa va izohingiz faqat admin tomonidan tekşiriladi; karta ma’lumotlaringiz saytga kiritilmaydi.",
        "Katalog (kitob, muallif, naşriyot yozuvlari) umumiy: siz qöşgan katalog yozuvini boşqalar ham köradi. Şaxsiy fikrlaringiz katalogga ötmaydi.",
        "AI imkoniyatlaridan foydalanganingizda yozgan savolingiz, tanlagan matn yoki yuborgan faylingiz javob tayyorlaş uçun AI xizmatiga (Google Gemini) yuboriladi. Juda şaxsiy ma’lumotni AI ga yubormang.",
      ],
    },
    {
      h: "Öçiriş",
      p: [
        "Sozlamalar → «Hisobni öçiriş» hisobingizni, barça şaxsiy yozuvlaringiz va fayllaringizni darhol öçiradi. Undan oldin taqriz va kitoblaringizni yuklab olişingiz mumkin.",
      ],
    },
    {
      h: "Boğlaniş",
      p: [
        `Savol yoki iltimos bölsa: ${CONTACT_EMAIL}. Saytning özida — Takliflar → «Adminga yoziş».`,
      ],
    },
  ],
};

const enPrivacy: LegalDoc = {
  title: "Privacy policy",
  intro:
    "NodiNote is a personal notebook for what you read, watch and learn. This page says in plain words what is kept, who can see it and how you can delete it.",
  sections: [
    {
      h: "What is kept",
      p: [
        "Your account: first and last name, username and picture. With Google — also your email; with Telegram — your Telegram ID.",
        "What you create: your library and reading status, write-ups, notes, quotes, study cards, goals, collections, AI chats and the files you upload.",
        "Messages you send to the bot or through “Write to the admin”.",
      ],
    },
    {
      h: "Why",
      p: [
        "Only so the site can serve you: your library, what you write, search, statistics, the AI assistant and audiobooks. No ads; your data is never sold or given to anyone.",
      ],
    },
    {
      h: "Who can see it",
      p: [
        "Your notes, write-ups, quotes, cards and files are visible only to you. Big files are stored encrypted.",
        "A book you upload and the audiobook made from it are never given to others. Upload only legal copies and do not share them (see the Terms of use).",
        "Your profile is private by default. If you make it public, others see your name, picture, username and the items you mark public (title, status, rating) and may follow you. Making it private hides everything at once.",
        "For Premium, the amount and note in your payment request are seen only by the admin; your card details are never entered on the site.",
        "The catalog (books, authors, publishers) is shared: catalog entries you add are visible to others. Your personal thoughts never go into the catalog.",
        "When you use AI features, your question, the selected text or the file you send goes to an AI service (Google Gemini) to prepare the answer. Do not send very personal data to the AI.",
      ],
    },
    {
      h: "Deletion",
      p: [
        "Settings → “Delete account” removes your account, all your personal records and files at once. You can download your write-ups and books before that.",
      ],
    },
    {
      h: "Contact",
      p: [
        `Questions or requests: ${CONTACT_EMAIL}. On the site — Suggestions → “Write to the admin”.`,
      ],
    },
  ],
};

const uzTerms: LegalDoc = {
  title: "Foydalaniş şartlari",
  intro: "NodiNote’dan foydalanib, quyidagi oddiy şartlarga rozilik bildirasiz.",
  sections: [
    {
      h: "Xizmat",
      p: [
        "Sayt bepul va «boriça» taqdim etiladi; imkoniyatlar özgarişi yoki vaqtinça işlamay qolişi mumkin. Muhim yozuvlaringizni yuklab olib turing.",
        "AI kunlik limit bilan işlaydi va xato qilişi mumkin: uning javoblari, savollari va audiokitob ovozini tekşirib foydalaning.",
      ],
    },
    {
      h: "Sizning kontentingiz",
      p: [
        "Yozganlaringiz sizniki. Faqat qonuniy nusxalarni yuklang: sotib olingan, muallif yoki nashriyot ruxsat bergan yoki erkin tarqatiladigan kitoblar. Mualliflik huquqi bilan himoyalangan kitobning noqonuniy (ögirlangan) PDF’ini yuklaş taqiqlanadi.",
        "Kitob matni, öquvçi va AI tayyorlagan audiokitob faqat sizning şaxsiy foydalanişingiz uçun. Ularni Telegram kanallari, guruhlar yoki boşqa joylarda tarqatiş, sotiş yoki ommaga joylaş mumkin emas. Huquq egasi murojaat qilsa, tegişli fayl va audiokitob öçiriladi, qoidabuzar hisob esa töxtatilishi mumkin.",
        "Katalogga qöşgan yozuvlaringiz (kitob nomi, muallif, naşriyot) umumiy böladi va boşqalar ularni töldirişi mumkin.",
      ],
    },
    {
      h: "Taqiqlanadi",
      p: [
        "Noqonuniy yoki haqoratli kontent, boşqalarning huquqini buziş, saytni buzişga yoki boşqa hisoblarga kirişga uriniş, spam. Bunday holatda hisob töxtatilişi mumkin.",
      ],
    },
    { h: "Boğlaniş", p: [`Savollar bölsa: ${CONTACT_EMAIL}.`] },
  ],
};

const enTerms: LegalDoc = {
  title: "Terms of use",
  intro: "By using NodiNote you agree to these simple terms.",
  sections: [
    {
      h: "The service",
      p: [
        "The site is free and provided “as is”; features may change or be briefly unavailable. Download copies of what matters to you.",
        "The AI has daily limits and can be wrong: check its answers, questions and audiobook narration.",
      ],
    },
    {
      h: "Your content",
      p: [
        "What you write is yours. Upload only legal copies: books you bought, that the author or publisher allows, or that are free to share. Uploading pirated PDFs of copyrighted books is forbidden.",
        "The book’s text, the reader and AI-made audiobooks are for your personal use only. Do not share, sell or post them in Telegram channels, groups or anywhere else. After a rights holder’s complaint the file and audiobook are removed and the account may be suspended.",
        "Catalog entries you add (titles, authors, publishers) become shared and may be completed by others.",
      ],
    },
    {
      h: "Not allowed",
      p: [
        "Illegal or abusive content, infringing others’ rights, trying to break the site or get into other accounts, spam. Such accounts may be suspended.",
      ],
    },
    { h: "Contact", p: [`Questions: ${CONTACT_EMAIL}.`] },
  ],
};

const ruPrivacy: LegalDoc = {
  title: "Политика конфиденциальности",
  intro:
    "NodiNote — личный дневник того, что вы прочитали, посмотрели и изучили. Здесь простыми словами описано, какие данные хранятся, кто их видит и как их удалить.",
  sections: [
    {
      h: "Что хранится",
      p: [
        "Ваш аккаунт: имя, фамилия, имя пользователя (username) и фото. При входе через Google — также email; через Telegram — ваш Telegram ID.",
        "То, что вы создаёте: библиотека и статус чтения, рецензии, заметки, цитаты, карточки, цели, подборки, чаты с ИИ и загруженные файлы.",
        "Сообщения, которые вы отправляете боту или через «Написать администратору».",
      ],
    },
    {
      h: "Зачем",
      p: [
        "Только чтобы сайт работал для вас: библиотека, ваши записи, поиск, статистика, ИИ-помощник и аудиокниги. Рекламы нет; ваши данные не продаются и никому не передаются.",
      ],
    },
    {
      h: "Кто видит",
      p: [
        "Ваши заметки, рецензии, цитаты, карточки и файлы видны только вам. Большие файлы хранятся в зашифрованном виде.",
        "Загруженная вами книга и аудиокнига из неё никому не передаются. Загружайте только легальные копии и не распространяйте их (см. Условия использования).",
        "Профиль по умолчанию закрыт. Если вы его откроете, другие увидят ваше имя, фото, username и отмеченные как открытые материалы (название, статус, оценка) и смогут подписаться на вас. Закрыв профиль, вы сразу всё скроете.",
        "Для Premium сумму и комментарий в заявке на оплату видит только администратор; данные карты на сайте не вводятся.",
        "Каталог (книги, авторы, издательства) общий: добавленные вами записи каталога видят и другие. Ваши личные мысли в каталог не попадают.",
        "Когда вы пользуетесь ИИ, ваш вопрос, выделенный текст или файл отправляются в ИИ-сервис (Google Gemini) для подготовки ответа. Не отправляйте ИИ очень личные данные.",
      ],
    },
    {
      h: "Удаление",
      p: [
        "Настройки → «Удалить аккаунт» сразу удаляет аккаунт, все личные записи и файлы. Перед этим можно скачать свои рецензии и книги.",
      ],
    },
    {
      h: "Связь",
      p: [
        `Вопросы и просьбы: ${CONTACT_EMAIL}. На сайте — Предложения → «Написать администратору».`,
      ],
    },
  ],
};

const ruTerms: LegalDoc = {
  title: "Условия использования",
  intro: "Пользуясь NodiNote, вы соглашаетесь с этими простыми условиями.",
  sections: [
    {
      h: "Сервис",
      p: [
        "Сайт бесплатный и предоставляется «как есть»; возможности могут меняться или ненадолго быть недоступны. Скачивайте копии важного.",
        "У ИИ есть дневные лимиты, и он может ошибаться: проверяйте его ответы, вопросы и озвучку аудиокниг.",
      ],
    },
    {
      h: "Ваш контент",
      p: [
        "Всё, что вы пишете, принадлежит вам. Загружайте только легальные копии: купленные книги, книги с разрешения автора или издательства либо свободно распространяемые. Загружать пиратские PDF книг, защищённых авторским правом, запрещено.",
        "Текст книги, читалка и аудиокниги, созданные ИИ, — только для вашего личного пользования. Их нельзя распространять, продавать или выкладывать в Telegram-каналы, группы и куда-либо ещё. По жалобе правообладателя файл и аудиокнига удаляются, а аккаунт может быть заблокирован.",
        "Добавленные вами записи каталога (названия, авторы, издательства) становятся общими, и другие могут их дополнять.",
      ],
    },
    {
      h: "Запрещено",
      p: [
        "Незаконный или оскорбительный контент, нарушение чужих прав, попытки взломать сайт или войти в чужие аккаунты, спам. Такие аккаунты могут быть заблокированы.",
      ],
    },
    { h: "Связь", p: [`Вопросы: ${CONTACT_EMAIL}.`] },
  ],
};

export function legalDoc(kind: "privacy" | "terms", locale: string): LegalDoc {
  const set = {
    uz: { privacy: uzPrivacy, terms: uzTerms },
    en: { privacy: enPrivacy, terms: enTerms },
    ru: { privacy: ruPrivacy, terms: ruTerms },
  };
  return set[(locale in set ? locale : "uz") as keyof typeof set][kind];
}

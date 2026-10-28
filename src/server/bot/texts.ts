/** What the bot says, in the person's Telegram language (uz is the 2026 Latin alphabet). */
export type BotLang = "uz" | "ru" | "en";

export const langOf = (code?: string | null): BotLang =>
  code?.startsWith("ru") ? "ru" : code?.startsWith("en") ? "en" : "uz";

const T = {
  uz: {
    welcome: (name: string) =>
      `Assalomu alaykum, <b>${name}</b>! 👋\n\n<b>NodiNote</b> — öqigan, körgan va örgangan narsalaringiz uçun şaxsiy daftar: kitoblar, taqrizlar, iqtiboslar, AI yordamçi va audiokitoblar.\n\nBu bot orqali:\n• saytga bir bosişda kirasiz (telefon raqami kerak emas);\n• taklif va savollaringizni adminga yozasiz — javob şu yerga keladi;\n• yangiliklardan xabardor bölasiz.`,
    open: "🌐 Saytni oçiş",
    suggest: "💬 Taklif yoziş",
    help: "❓ Yordam",
    helpText:
      "<b>Buyruqlar</b>\n/start — boşlaş\n/taklif — adminga xabar yoziş\n/sayt — saytni oçiş\n/help — yordam\n\nIstalgan matnni yozsangiz ham, u adminga taklif sifatida boradi.",
    askSuggest:
      "Taklif, savol yoki xatolik haqida bitta xabarda yozing — men uni adminga yetkazaman. ✍️",
    thanks: "Rahmat! Xabaringiz adminga yuborildi. Javob şu yerga keladi. 🙏",
    tooMany: "Bugun juda köp xabar yubordingiz. Iltimos, ertaga yozing.",
    textOnly: "Hozirça faqat matnli xabarlar qabul qilinadi.",
    loginAsk: (device: string) =>
      `🔐 <b>NodiNote'ga kiriş</b>\n\nQurilma: <b>${device || "brauzer"}</b>\n\nAgar hozir saytga siz kirayotgan bölsangiz, «Tasdiqlaş»ni bosing. Siz bölmasangiz — «Bekor qiliş».`,
    confirm: "✅ Tasdiqlaş",
    cancel: "❌ Bekor qiliş",
    loginOk: "✅ Tasdiqlandi! Saytga qayting — u özi oçiladi.",
    loginBack: "↩️ Saytga qaytiş",
    loginGone: "⌛ Bu kiriş havolasi eskirgan. Saytda «Telegram orqali kiriş»ni qayta bosing.",
    loginCancelled:
      "Kiriş bekor qilindi. Agar bu siz bölmagan bölsangiz, hammasi joyida — hisobingiz xavfsiz.",
    reply: (title: string, text: string) => `📩 <b>Admin javobi</b>\n<i>${title}</i>\n\n${text}`,
  },
  ru: {
    welcome: (name: string) =>
      `Здравствуйте, <b>${name}</b>! 👋\n\n<b>NodiNote</b> — личный дневник того, что вы прочитали, посмотрели и изучили: книги, рецензии, цитаты, ИИ-помощник и аудиокниги.\n\nЧерез этого бота вы можете:\n• входить на сайт в одно касание (без номера телефона);\n• писать администратору предложения и вопросы — ответ придёт сюда;\n• узнавать о новостях.`,
    open: "🌐 Открыть сайт",
    suggest: "💬 Написать предложение",
    help: "❓ Помощь",
    helpText:
      "<b>Команды</b>\n/start — начать\n/taklif — написать администратору\n/sayt — открыть сайт\n/help — помощь\n\nЛюбой текст тоже уйдёт администратору как предложение.",
    askSuggest:
      "Напишите предложение, вопрос или сообщение об ошибке одним сообщением — я передам его администратору. ✍️",
    thanks: "Спасибо! Сообщение отправлено администратору. Ответ придёт сюда. 🙏",
    tooMany: "Сегодня вы отправили слишком много сообщений. Пожалуйста, напишите завтра.",
    textOnly: "Пока принимаются только текстовые сообщения.",
    loginAsk: (device: string) =>
      `🔐 <b>Вход в NodiNote</b>\n\nУстройство: <b>${device || "браузер"}</b>\n\nЕсли это вы сейчас входите на сайт, нажмите «Подтвердить». Если нет — «Отмена».`,
    confirm: "✅ Подтвердить",
    cancel: "❌ Отмена",
    loginOk: "✅ Подтверждено! Вернитесь на сайт — он откроется сам.",
    loginBack: "↩️ Вернуться на сайт",
    loginGone: "⌛ Эта ссылка для входа устарела. Нажмите «Войти через Telegram» на сайте ещё раз.",
    loginCancelled:
      "Вход отменён. Если это были не вы — всё в порядке, ваш аккаунт в безопасности.",
    reply: (title: string, text: string) =>
      `📩 <b>Ответ администратора</b>\n<i>${title}</i>\n\n${text}`,
  },
  en: {
    welcome: (name: string) =>
      `Hello, <b>${name}</b>! 👋\n\n<b>NodiNote</b> is a personal notebook for what you read, watch and learn: books, write-ups, quotes, an AI assistant and audiobooks.\n\nWith this bot you can:\n• sign in to the site in one tap (no phone number);\n• send suggestions and questions to the admin — the answer comes here;\n• hear about what’s new.`,
    open: "🌐 Open the site",
    suggest: "💬 Send a suggestion",
    help: "❓ Help",
    helpText:
      "<b>Commands</b>\n/start — start\n/taklif — write to the admin\n/sayt — open the site\n/help — help\n\nAny text you send also goes to the admin as a suggestion.",
    askSuggest:
      "Write your suggestion, question or bug report in one message — I’ll pass it to the admin. ✍️",
    thanks: "Thank you! Your message was sent to the admin. The answer will come here. 🙏",
    tooMany: "You have sent too many messages today. Please write again tomorrow.",
    textOnly: "Only text messages are accepted for now.",
    loginAsk: (device: string) =>
      `🔐 <b>Sign in to NodiNote</b>\n\nDevice: <b>${device || "browser"}</b>\n\nIf you are signing in to the site right now, press “Confirm”. If not — “Cancel”.`,
    confirm: "✅ Confirm",
    cancel: "❌ Cancel",
    loginOk: "✅ Confirmed! Go back to the site — it opens by itself.",
    loginBack: "↩️ Back to the site",
    loginGone:
      "⌛ This sign-in link has expired. Press “Continue with Telegram” on the site again.",
    loginCancelled: "Sign-in cancelled. If it wasn’t you, all is well — your account is safe.",
    reply: (title: string, text: string) => `📩 <b>Admin’s answer</b>\n<i>${title}</i>\n\n${text}`,
  },
} as const;

export const botText = (lang: BotLang) => T[lang];

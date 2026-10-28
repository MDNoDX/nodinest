/**
 * One-time (and repeatable) setup of the site's Telegram bot and admin channel:
 * name, descriptions and commands in uz / ru / en, the webhook (with its
 * secret header), the bot's and the channel's pictures and the channel text.
 *
 *   TELEGRAM_BOT_TOKEN=… TELEGRAM_ADMIN_CHAT_ID=… SITE_URL=https://… \
 *     npx tsx scripts/telegram-setup.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
const chat = process.env.TELEGRAM_ADMIN_CHAT_ID ?? "";
const site = (process.env.SITE_URL ?? "https://nodinest.vercel.app").replace(/\/$/, "");
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
const api = (m: string) => `https://api.telegram.org/bot${token}/${m}`;

async function call(method: string, body: Record<string, unknown> | FormData) {
  const r = await fetch(api(method), {
    method: "POST",
    ...(body instanceof FormData
      ? { body }
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const d = (await r.json()) as { ok: boolean; description?: string };
  console.log(method, d.ok ? "ok" : `FAILED: ${d.description}`);
  return d.ok;
}

const T = {
  uz: {
    name: "NodiNote",
    short:
      "Öqigan, körgan va örganganlaringiz daftari. Saytga bir bosişda kiriş, takliflar va javoblar.",
    desc: "📚 NodiNote — kitoblar, taqrizlar, iqtiboslar, AI yordamçi va audiokitoblar uçun şaxsiy daftar.\n\nBu bot:\n• saytga telefon raqamisiz, bir bosişda kirgizadi;\n• taklif va savollaringizni adminga yetkazadi — javob şu yerga keladi;\n• yangiliklardan xabar beradi.\n\nBoşlaş uçun «Start»ni bosing.",
    commands: [
      ["start", "Boşlaş"],
      ["taklif", "Adminga xabar yozish"],
      ["sayt", "Saytni oçiş"],
      ["help", "Yordam"],
    ],
  },
  ru: {
    name: "NodiNote",
    short: "Дневник прочитанного и изученного. Вход на сайт в одно касание, предложения и ответы.",
    desc: "📚 NodiNote — личный дневник для книг, рецензий, цитат, ИИ-помощника и аудиокниг.\n\nЭтот бот:\n• входит на сайт в одно касание, без номера телефона;\n• передаёт ваши предложения и вопросы администратору — ответ придёт сюда;\n• сообщает о новостях.\n\nНажмите «Start», чтобы начать.",
    commands: [
      ["start", "Начать"],
      ["taklif", "Написать администратору"],
      ["sayt", "Открыть сайт"],
      ["help", "Помощь"],
    ],
  },
  en: {
    name: "NodiNote",
    short: "A notebook for what you read and learn. One-tap sign-in, suggestions and answers.",
    desc: "📚 NodiNote — a personal notebook for books, write-ups, quotes, an AI assistant and audiobooks.\n\nThis bot:\n• signs you in to the site in one tap, no phone number;\n• passes your suggestions and questions to the admin — the answer comes here;\n• tells you what’s new.\n\nPress “Start” to begin.",
    commands: [
      ["start", "Start"],
      ["taklif", "Write to the admin"],
      ["sayt", "Open the site"],
      ["help", "Help"],
    ],
  },
} as const;

async function main() {
  for (const [lang, t] of Object.entries(T)) {
    const code = lang === "uz" ? {} : { language_code: lang };
    await call("setMyName", { name: t.name, ...code });
    await call("setMyShortDescription", { short_description: t.short, ...code });
    await call("setMyDescription", { description: t.desc, ...code });
    await call("setMyCommands", {
      commands: t.commands.map(([command, description]) => ({ command, description })),
      ...code,
    });
  }
  await call("setChatMenuButton", {
    menu_button: { type: "commands" },
  });
  const secret = createHash("sha256").update(`nn-webhook:${token}`).digest("hex").slice(0, 48);
  await call("setWebhook", {
    url: `${site}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "channel_post", "my_chat_member"],
    drop_pending_updates: true,
  });

  const pic = (file: string) => new Blob([readFileSync(file)], { type: "image/png" });
  const bot = new FormData();
  bot.set("photo", JSON.stringify({ type: "static", photo: "attach://pic" }));
  bot.set("pic", pic("assets/telegram/bot.png"), "bot.png");
  await call("setMyProfilePhoto", bot);

  if (chat) {
    const ch = new FormData();
    ch.set("chat_id", chat);
    ch.set("photo", pic("assets/telegram/channel.png"), "channel.png");
    await call("setChatPhoto", ch);
    await call("setChatDescription", {
      chat_id: chat,
      description:
        "NodiNote monitoringi: takliflar (javob = reply), yangi foydalanuvçilar, xatolar, Premium tölovlari va kunlik hisobot. Buyruqlar: /stat, /hammaga <matn>, /arxiv, /test.",
    });
  }
}

void main();

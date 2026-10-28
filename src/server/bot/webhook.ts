/**
 * The site's Telegram bot (webhook /api/telegram/webhook):
 *  • private chats: /start (welcome + buttons), sign-in confirmation
 *    (/start login_<code>), suggestions to the admin (any text), /help;
 *  • the admin channel (TELEGRAM_ADMIN_CHAT_ID): replying to a suggestion
 *    post answers that person (bot + Takliflar on the site); "/hammaga <text>"
 *    sends an announcement to everyone who started the bot; "/stat" posts the
 *    summary now. Only posts from that channel are trusted for admin commands.
 */
import "server-only";
import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { account, botUsers, feedback, tgPosts } from "@/db/schema";
import { hitRateLimit } from "@/server/rate-limit";
import { approveLogin, cancelLogin, pendingLogin, type TgUser } from "@/server/telegram-login";
import { postFeedback } from "@/server/monitor/events";
import { dailySummary } from "@/server/monitor/summary";
import { esc, tgRaw, tgSend, tgTo } from "@/server/monitor/telegram";
import { moveWaiting } from "@/server/tg-storage";
import { decidePayment } from "@/server/premium";
import { botText, langOf, type BotLang } from "./texts";

type Msg = {
  message_id: number;
  from?: TgUser & { is_bot?: boolean };
  chat: { id: number; type: string };
  text?: string;
  reply_to_message?: { message_id: number };
};
type Update = {
  message?: Msg;
  channel_post?: Msg;
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
  my_chat_member?: { chat: { id: number; type: string }; new_chat_member: { status: string } };
};

const site = () => process.env.BETTER_AUTH_URL ?? "https://nodinest.vercel.app";

async function seen(u: TgUser) {
  await db
    .insert(botUsers)
    .values({
      tgId: u.id,
      username: u.username ?? null,
      firstName: u.first_name ?? null,
      language: u.language_code ?? null,
    })
    .onConflictDoUpdate({
      target: botUsers.tgId,
      set: {
        username: u.username ?? null,
        firstName: u.first_name ?? null,
        language: u.language_code ?? null,
        blocked: false,
        lastSeenAt: new Date(),
      },
    });
}

const menu = (L: BotLang) => ({
  inline_keyboard: [
    [{ text: botText(L).open, url: site() }],
    [
      { text: botText(L).suggest, callback_data: "S" },
      { text: botText(L).help, callback_data: "H" },
    ],
  ],
});

async function onPrivate(m: Msg) {
  const from = m.from;
  if (!from || from.is_bot) return;
  const L = langOf(from.language_code);
  const T = botText(L);
  await seen(from);
  const text = (m.text ?? "").trim();
  if (!text) {
    await tgTo(m.chat.id, T.textOnly);
    return;
  }
  const login = /^\/start\s+login_([A-Za-z0-9_-]{43})$/.exec(text);
  if (login) {
    const p = await pendingLogin(login[1]);
    if (!p || p.approvedAt) {
      await tgTo(m.chat.id, T.loginGone);
      return;
    }
    await tgTo(m.chat.id, T.loginAsk(esc(p.device ?? "")), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: T.confirm, callback_data: `L:${login[1]}` },
            { text: T.cancel, callback_data: `X:${login[1]}` },
          ],
        ],
      },
    });
    return;
  }
  if (/^\/start\b/.test(text)) {
    await tgTo(m.chat.id, T.welcome(esc(from.first_name ?? from.username ?? "")), {
      reply_markup: menu(L),
    });
    return;
  }
  if (/^\/help\b/.test(text)) {
    await tgTo(m.chat.id, T.helpText, { reply_markup: menu(L) });
    return;
  }
  if (/^\/sayt\b/.test(text)) {
    await tgTo(m.chat.id, `🌐 ${site()}`, { reply_markup: menu(L) });
    return;
  }
  if (/^\/taklif\b/.test(text) && text.replace(/^\/taklif\S*/, "").trim() === "") {
    await db.update(botUsers).set({ awaiting: "suggest" }).where(eq(botUsers.tgId, from.id));
    await tgTo(m.chat.id, T.askSuggest);
    return;
  }
  if (text.startsWith("/")) {
    await tgTo(m.chat.id, T.helpText, { reply_markup: menu(L) });
    return;
  }
  // Any other text is a message to the admin.
  if (!(await hitRateLimit(db, `bot-msg:${from.id}`, 15, 86_400)).allowed) {
    await tgTo(m.chat.id, T.tooMany);
    return;
  }
  const [acc] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.providerId, "telegram"), eq(account.accountId, String(from.id))));
  const body = text.replace(/^\/taklif\S*\s*/, "").slice(0, 5000);
  const [row] = await db
    .insert(feedback)
    .values({
      userId: acc?.userId ?? null,
      title: body.split("\n")[0].slice(0, 80) || "Telegram",
      body,
      contact: from.username ? `@${from.username}` : `tg:${from.id}`,
      source: "bot",
      tgId: from.id,
    })
    .returning({ id: feedback.id });
  await db.update(botUsers).set({ awaiting: null }).where(eq(botUsers.tgId, from.id));
  await postFeedback(row.id);
  await tgTo(m.chat.id, T.thanks);
}

async function onCallback(q: NonNullable<Update["callback_query"]>) {
  const L = langOf(q.from.language_code);
  const T = botText(L);
  const data = q.data ?? "";
  const chat = q.message?.chat.id;
  const mid = q.message?.message_id;
  const edit = (text: string, markup?: unknown) =>
    chat && mid
      ? tgRaw("editMessageText", {
          chat_id: chat,
          message_id: mid,
          text,
          parse_mode: "HTML",
          reply_markup: markup,
        })
      : null;
  // Premium payments: only an admin of the admin channel may decide.
  if (/^P[AR]:/.test(data) && String(chat) === process.env.TELEGRAM_ADMIN_CHAT_ID) {
    const m = await tgRaw<{ status: string }>("getChatMember", {
      chat_id: chat,
      user_id: q.from.id,
    });
    if (!m || !["administrator", "creator"].includes(m.status)) {
      await tgRaw("answerCallbackQuery", { callback_query_id: q.id, text: "⛔" });
      return;
    }
    const p = await decidePayment(data.slice(3), data[1] === "A", `tg:${q.from.id}`);
    await tgRaw("answerCallbackQuery", {
      callback_query_id: q.id,
      text: p ? (data[1] === "A" ? "✅" : "❌") : "Allaqaçon hal qilingan",
    });
    if (p && mid)
      await tgRaw("editMessageReplyMarkup", {
        chat_id: chat,
        message_id: mid,
        reply_markup: { inline_keyboard: [] },
      });
    return;
  }
  await seen(q.from);
  if (data.startsWith("L:")) {
    const ok = await approveLogin(data.slice(2), q.from);
    await tgRaw("answerCallbackQuery", { callback_query_id: q.id });
    await edit(
      ok ? T.loginOk : T.loginGone,
      ok ? { inline_keyboard: [[{ text: T.loginBack, url: site() }]] } : undefined,
    );
    return;
  }
  if (data.startsWith("X:")) {
    await cancelLogin(data.slice(2));
    await tgRaw("answerCallbackQuery", { callback_query_id: q.id });
    await edit(T.loginCancelled);
    return;
  }
  await tgRaw("answerCallbackQuery", { callback_query_id: q.id });
  if (!chat) return;
  if (data === "S") {
    await db.update(botUsers).set({ awaiting: "suggest" }).where(eq(botUsers.tgId, q.from.id));
    await tgTo(chat, T.askSuggest);
  } else if (data === "H") await tgTo(chat, T.helpText, { reply_markup: menu(L) });
}

/** The admin answers a suggestion: stored, shown on the site and sent by the bot. */
async function answer(feedbackId: string, text: string) {
  const [f] = await db
    .update(feedback)
    .set({
      reply: text.slice(0, 5000),
      repliedAt: new Date(),
      status: "done",
      updatedAt: new Date(),
    })
    .where(eq(feedback.id, feedbackId))
    .returning();
  if (!f) return false;
  const targets = new Set<number>();
  if (f.tgId) targets.add(f.tgId);
  if (f.userId) {
    const rows = await db
      .select({ tgId: botUsers.tgId })
      .from(botUsers)
      .where(and(eq(botUsers.userId, f.userId), eq(botUsers.blocked, false)));
    rows.forEach((r) => targets.add(r.tgId));
  }
  for (const id of targets) {
    const [u] = await db.select().from(botUsers).where(eq(botUsers.tgId, id));
    const T = botText(langOf(u?.language));
    await tgTo(id, T.reply(esc(f.title), esc(text)));
  }
  return true;
}

async function broadcast(text: string) {
  const rows = await db
    .select({ tgId: botUsers.tgId })
    .from(botUsers)
    .where(eq(botUsers.blocked, false));
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const id = await tgTo(r.tgId, text);
    if (id) sent++;
    else {
      failed++;
      await db.update(botUsers).set({ blocked: true }).where(eq(botUsers.tgId, r.tgId));
    }
    await new Promise((res) => setTimeout(res, 40)); // ≤ 25 messages a second
  }
  await tgSend(`📣 Xabar yuborildi: <b>${sent}</b> ta${failed ? `, yetmadi: ${failed}` : ""}.`);
}

async function onChannel(m: Msg) {
  if (String(m.chat.id) !== process.env.TELEGRAM_ADMIN_CHAT_ID) return;
  const text = (m.text ?? "").trim();
  if (!text) return;
  const react = (emoji: string) =>
    tgRaw("setMessageReaction", {
      chat_id: m.chat.id,
      message_id: m.message_id,
      reaction: [{ type: "emoji", emoji }],
    });
  if (m.reply_to_message) {
    const [p] = await db
      .select()
      .from(tgPosts)
      .where(eq(tgPosts.messageId, m.reply_to_message.message_id));
    if (p?.feedbackId) {
      await react((await answer(p.feedbackId, text)) ? "👍" : "🤷");
      return;
    }
  }
  const bc = /^\/(hammaga|broadcast)\s+([\s\S]+)/.exec(text);
  if (bc) {
    after(() => broadcast(bc[2].trim()));
    await react("👀");
    return;
  }
  if (/^\/stat\b/.test(text)) {
    after(() => dailySummary());
    return;
  }
  if (/^\/arxiv\b/.test(text)) {
    after(async () => {
      const n = await moveWaiting(250_000);
      await tgSend(`🗄 Telegram omboriga köçirildi: <b>${n}</b> ta fayl.`);
    });
    await react("👀");
    return;
  }
  if (/^\/test\b/.test(text)) await tgSend("✅ Bot işlayapti.");
}

export async function handleUpdate(u: Update) {
  if (u.message && u.message.chat.type === "private") await onPrivate(u.message);
  else if (u.callback_query) await onCallback(u.callback_query);
  else if (u.channel_post) await onChannel(u.channel_post);
  else if (u.my_chat_member && u.my_chat_member.chat.type === "private") {
    const blocked = ["kicked", "left"].includes(u.my_chat_member.new_chat_member.status);
    await db.update(botUsers).set({ blocked }).where(eq(botUsers.tgId, u.my_chat_member.chat.id));
  }
}

/** For the summary: how many people use the bot. */
export async function botStats() {
  const [r] = await db.execute<{ all: number; active: number }>(
    sql`select count(*)::int as all, count(*) filter (where not blocked)::int as active from nodinest.bot_users`,
  );
  return r;
}

/**
 * Premium for Telegram Stars (currency XTR), automatic end to end:
 *  1. /premium → `starsInvoiceLink` makes a Bot API invoice link for THIS
 *     account; its payload is signed (account, months, price, expiry), so a
 *     link cannot be bent to another account or a lower price.
 *  2. Telegram asks before taking the Stars (`pre_checkout_query`): the payload
 *     and the amount are checked again (`onPreCheckout`).
 *  3. `successful_payment` (`onStarsPaid`): one payment row per Telegram charge
 *     id (a repeated update grants nothing twice), premium_until moves on by the
 *     months, the person hears it in the bot and the owner in the admin chat.
 * In the bot, "/start premium" (the link in ads) offers the plans; an account
 * that has not linked the bot is sent to the site to pay from there.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type AppContext } from "@/db";
import { botUsers, payments, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { esc, tgRaw, tgSend, tgTo } from "./monitor/telegram";
import { getPremiumSettings } from "./premium";

export const STAR_PLANS = [1, 3, 12] as const;
export type StarPlan = (typeof STAR_PLANS)[number];

/** Stars for a plan: 3 months 10 % off, a year 20 % off. */
export function starsFor(months: number, starsMonth: number) {
  const off = months >= 12 ? 0.8 : months >= 3 ? 0.9 : 1;
  return Math.max(1, Math.round(starsMonth * months * off));
}

export async function starPlans() {
  const s = await getPremiumSettings();
  return STAR_PLANS.map((months) => ({ months, stars: starsFor(months, s.starsMonth) }));
}

const key = () => process.env.BETTER_AUTH_SECRET || "dev";
const mac = (body: string) =>
  createHmac("sha256", `stars:${key()}`).update(body).digest("base64url").slice(0, 22);

/** "pr.<user>.<months>.<stars>.<exp>.<mac>" (≤ 128 bytes, Telegram's limit). */
function makePayload(userId: string, months: number, stars: number) {
  const exp = Math.floor(Date.now() / 1000) + 3 * 86_400;
  const body = `pr.${userId}.${months}.${stars}.${exp}`;
  return `${body}.${mac(body)}`;
}

function readPayload(p: string) {
  const parts = p.split(".");
  if (parts.length !== 6 || parts[0] !== "pr") return null;
  const body = parts.slice(0, 5).join(".");
  const want = Buffer.from(mac(body));
  const got = Buffer.from(parts[5]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [, userId, months, stars, exp] = parts;
  if (!z.string().uuid().safeParse(userId).success) return null;
  return { userId, months: Number(months), stars: Number(stars), exp: Number(exp) };
}

async function invoice(userId: string, months: StarPlan, lang: string) {
  const s = await getPremiumSettings();
  const stars = starsFor(months, s.starsMonth);
  const ru = lang === "ru";
  const en = lang === "en";
  return {
    title: en
      ? `Röznoma Premium · ${months} mo`
      : ru
        ? `Röznoma Premium · ${months} мес.`
        : `Röznoma Premium · ${months} oy`,
    description: en
      ? "More AI answers, audiobooks, study cards, no ads. Turns on in Röznoma right after payment."
      : ru
        ? "Больше ответов ИИ, аудиокниги, карточки, без рекламы. Включается в Röznoma сразу после оплаты."
        : "Köproq AI javoblari, audiokitoblar, savol kartalari, reklamasiz. Tölovdan keyin Röznoma'da darhol yoqiladi.",
    payload: makePayload(userId, months, stars),
    currency: "XTR",
    prices: [{ label: `Premium ${months}`, amount: stars }],
  };
}

/** The Telegram payment link for this account and plan (opened from /premium). */
export async function starsInvoiceLink(ctx: AppContext, months: number, lang: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new AppError("STORAGE_UNAVAILABLE", "no_bot");
  const plan = STAR_PLANS.find((m) => m === months);
  if (!plan) throw new AppError("VALIDATION", "plan");
  const url = await tgRaw<string>("createInvoiceLink", await invoice(ctx.userId, plan, lang));
  if (!url || typeof url !== "string") throw new AppError("INTERNAL", "invoice");
  return url;
}

/** The bot sends the invoice itself (for a linked account, from "/start premium"). */
export async function sendStarsInvoice(
  chatId: number,
  userId: string,
  months: number,
  lang: string,
) {
  const plan = STAR_PLANS.find((m) => m === months);
  if (!plan) return;
  await tgRaw("sendInvoice", { chat_id: chatId, ...(await invoice(userId, plan, lang)) });
}

type PreCheckout = {
  id: string;
  currency: string;
  total_amount: number;
  invoice_payload: string;
};

/** Telegram asks "may I take the Stars?": yes only for a sound payload and price. */
export async function onPreCheckout(q: PreCheckout) {
  const p = readPayload(q.invoice_payload);
  const ok =
    !!p &&
    q.currency === "XTR" &&
    q.total_amount === p.stars &&
    STAR_PLANS.includes(p.months as StarPlan) &&
    p.exp * 1000 > Date.now() &&
    !!(await db.select({ id: user.id }).from(user).where(eq(user.id, p.userId)))[0];
  await tgRaw("answerPreCheckoutQuery", {
    pre_checkout_query_id: q.id,
    ok,
    ...(ok
      ? {}
      : {
          error_message: "Bu tölov havolasi eskirgan. Röznoma'da Premium sahifasidan qayta oçing.",
        }),
  });
}

type Paid = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
};

/** Stars received: Premium on (once per charge), the person and the owner told. */
export async function onStarsPaid(
  chat: { id: number },
  from: { id: number } | undefined,
  paid: Paid,
) {
  const p = readPayload(paid.invoice_payload);
  if (!p || paid.currency !== "XTR") {
    await tgSend(`⚠️ Stars tölovi tanilmadi: ${esc(paid.telegram_payment_charge_id)}`).catch(
      () => null,
    );
    return;
  }
  const charge = paid.telegram_payment_charge_id;
  const done = await db.transaction(async (tx) => {
    const [had] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.method, "stars"), eq(payments.note, charge)));
    if (had) return null;
    await tx.insert(payments).values({
      userId: p.userId,
      amount: paid.total_amount,
      months: p.months,
      method: "stars",
      note: charge,
      status: "approved",
      decidedAt: new Date(),
    });
    const [u] = await tx
      .update(user)
      .set({
        premiumUntil: sql`greatest(coalesce(${user.premiumUntil}, now()), now()) + (${p.months} * interval '30 days')`,
      })
      .where(eq(user.id, p.userId))
      .returning({ until: user.premiumUntil, name: user.name, username: user.username });
    // The bot now knows whose Telegram this is (notifications, the next renewal).
    if (from)
      await tx
        .update(botUsers)
        .set({ userId: p.userId })
        .where(and(eq(botUsers.tgId, from.id), sql`${botUsers.userId} is null`));
    return u;
  });
  if (!done) return;
  const until = done.until ? done.until.toLocaleDateString("ru-RU") : "";
  await tgTo(
    chat.id,
    `🎉 <b>Premium yoqildi!</b>\n${until ? `Amal qiladi: <b>${until}</b> gaça.\n` : ""}Röznoma'ni oçing — hammasi tayyor.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Röznoma'ni oçish",
              url: `${process.env.BETTER_AUTH_URL ?? "https://nodinest.netlify.app"}/premium`,
            },
          ],
        ],
      },
    },
  ).catch(() => null);
  await tgSend(
    `⭐ <b>Premium · Telegram Stars</b>\n👤 ${esc(done.name)}${done.username ? ` (@${esc(done.username)})` : ""}\n💫 ${paid.total_amount} Stars · ${p.months} oy → ${until} gaça`,
  ).catch(() => null);
}

/** Buttons with the plans (the bot's "/start premium"). */
export async function planButtons(prefix: string) {
  const plans = await starPlans();
  return {
    inline_keyboard: plans.map((pl) => [
      { text: `⭐ ${pl.stars} · ${pl.months} oy`, callback_data: `${prefix}${pl.months}` },
    ]),
  };
}

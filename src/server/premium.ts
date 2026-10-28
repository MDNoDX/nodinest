/**
 * Premium: what the free and the premium plan include (admin-editable, key
 * "premium" in app_settings), payment requests and their confirmation.
 *
 * Payments are manual: the user transfers to the admin's card / Payme / Click,
 * sends a request (amount, method, a note and optionally a screenshot) and the
 * admin confirms it on the site or with the buttons in the Telegram channel.
 * A confirmed payment extends `user.premium_until` by 30 days per month.
 */
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type AppContext } from "@/db";
import { appSettings, botUsers, files, payments, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { esc, tgRaw, tgSend, tgTo } from "./monitor/telegram";
import { enforceRateLimit } from "./rate-limit";

const limits = z.object({
  /** AI requests a day (assistant, ask, explain, write). */
  aiDaily: z.coerce.number().int().min(0).max(1000),
  /** Audiobooks (voicing a book). */
  audiobook: z.boolean(),
  /** AI study questions (make / improve cards). */
  studyCards: z.boolean(),
  /** Minutes of video / audio the AI may listen to a day (konspekt, transcripts). */
  listenMinutes: z.coerce.number().int().min(0).max(1440),
  /** Ads are shown. */
  ads: z.boolean(),
});
export type PlanLimits = z.infer<typeof limits>;

export const premiumSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Price of one month in so‘m. */
  priceMonth: z.coerce.number().int().min(0).max(100_000_000).default(25_000),
  card: z.string().trim().max(40).default(""),
  cardHolder: z.string().trim().max(80).default(""),
  payme: z.string().trim().max(300).default(""),
  click: z.string().trim().max(300).default(""),
  note: z.string().trim().max(1000).default(""),
  free: limits.default({
    aiDaily: 5,
    audiobook: false,
    studyCards: false,
    listenMinutes: 10,
    ads: true,
  }),
  premium: limits.default({
    aiDaily: 20,
    audiobook: true,
    studyCards: true,
    listenMinutes: 180,
    ads: false,
  }),
});
export type PremiumSettings = z.infer<typeof premiumSettingsSchema>;

let cache: { v: PremiumSettings; at: number } | null = null;
export async function getPremiumSettings(): Promise<PremiumSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "premium"));
  const parsed = premiumSettingsSchema.safeParse(row?.value ?? {});
  const v = parsed.success ? parsed.data : premiumSettingsSchema.parse({});
  cache = { v, at: Date.now() };
  return v;
}

export async function savePremiumSettings(ctx: AppContext, raw: unknown) {
  if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
  const value = premiumSettingsSchema.parse(raw);
  await db
    .insert(appSettings)
    .values({ key: "premium", value, updatedBy: ctx.userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: ctx.userId } });
  cache = null;
}

/** Is this account premium right now? (read from the DB, never from the client) */
export async function isPremium(userId: string) {
  const [u] = await db.select({ until: user.premiumUntil }).from(user).where(eq(user.id, userId));
  return !!u?.until && u.until > new Date();
}

/** The limits of the caller's plan; the superadmin account is not limited. */
export async function limitsFor(ctx: AppContext): Promise<PlanLimits & { premium: boolean }> {
  const s = await getPremiumSettings();
  if (ctx.superadminAccount)
    return {
      aiDaily: 100_000,
      audiobook: true,
      studyCards: true,
      listenMinutes: 1440,
      ads: false,
      premium: true,
    };
  const premium = await isPremium(ctx.userId);
  // While premium is switched off, everyone gets the premium plan's limits.
  return { ...(premium || !s.enabled ? s.premium : s.free), premium };
}

/** Throws PREMIUM_REQUIRED when the feature is not in the caller's plan. */
export async function requireFeature(ctx: AppContext, feature: "audiobook" | "studyCards") {
  const l = await limitsFor(ctx);
  if (!l[feature]) throw new AppError("PREMIUM_REQUIRED", feature);
}

// ─── Payments ────────────────────────────────────────────────────────────────

export const paymentInput = z.object({
  amount: z.coerce.number().int().min(1000).max(100_000_000),
  months: z.coerce.number().int().min(1).max(24),
  method: z.enum(["card", "payme", "click"]),
  note: z.string().trim().max(500).nullish(),
  receiptFileId: z.string().uuid().nullish(),
});

export async function requestPayment(ctx: AppContext, raw: unknown) {
  const a = paymentInput.parse(raw);
  await enforceRateLimit(db, `payment:${ctx.userId}`, 5, 86_400);
  if (a.receiptFileId) {
    const [f] = await db
      .select({ owner: files.ownerId })
      .from(files)
      .where(eq(files.id, a.receiptFileId));
    if (!f || f.owner !== ctx.userId) throw new AppError("FORBIDDEN", "receipt");
  }
  const [p] = await db
    .insert(payments)
    .values({
      userId: ctx.userId,
      amount: a.amount,
      months: a.months,
      method: a.method,
      note: a.note || null,
      receiptFileId: a.receiptFileId ?? null,
    })
    .returning();
  await announcePayment(p.id);
  return p.id;
}

/** The request in the admin channel with ✅ / ❌ buttons. */
async function announcePayment(id: string) {
  const [p] = await db
    .select({
      amount: payments.amount,
      months: payments.months,
      method: payments.method,
      note: payments.note,
      name: user.name,
      username: user.username,
    })
    .from(payments)
    .innerJoin(user, eq(user.id, payments.userId))
    .where(eq(payments.id, id));
  if (!p) return;
  const sum = p.amount.toLocaleString("ru-RU");
  await tgRaw("sendMessage", {
    chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID,
    parse_mode: "HTML",
    text: [
      `💳 <b>Premium tölovi</b> · ${esc(p.method)}`,
      `👤 ${esc(p.name)}${p.username ? ` (@${esc(p.username)})` : ""}`,
      `💰 <b>${sum} söm</b> · ${p.months} oy`,
      p.note ? `📝 ${esc(p.note)}` : null,
      "",
      "<i>Kartangizga pul tushganini tekşirib, tasdiqlang.</i>",
    ]
      .filter((l) => l !== null)
      .join("\n"),
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Tasdiqlaş", callback_data: `PA:${id}` },
          { text: "❌ Rad etiş", callback_data: `PR:${id}` },
        ],
      ],
    },
  });
}

/** Confirms or rejects a pending payment (site admin or channel admin). */
export async function decidePayment(id: string, approve: boolean, by: string) {
  const pid = z.string().uuid().parse(id);
  const [p] = await db
    .update(payments)
    .set({ status: approve ? "approved" : "rejected", decidedAt: new Date(), decidedBy: by })
    .where(and(eq(payments.id, pid), eq(payments.status, "pending")))
    .returning();
  if (!p) return null;
  if (approve)
    await db.execute(sql`
      update nodinest."user"
      set premium_until = greatest(coalesce(premium_until, now()), now()) + (${p.months} * interval '30 days')
      where id = ${p.userId}`);
  const [u] = await db
    .select({ until: user.premiumUntil, name: user.name })
    .from(user)
    .where(eq(user.id, p.userId));
  // Tell the person in the bot when they use it.
  const bots = await db
    .select({ tgId: botUsers.tgId })
    .from(botUsers)
    .where(eq(botUsers.userId, p.userId));
  for (const b of bots)
    await tgTo(
      b.tgId,
      approve
        ? `🎉 <b>Premium faollaştirildi!</b>\n${u?.until ? `Amal qiladi: ${u.until.toLocaleDateString("ru-RU")}` : ""}`
        : "To‘lov tasdiqlanmadi. Savol bölsa, Takliflar orqali yozing.",
    );
  await tgSend(
    `${approve ? "✅ Tasdiqlandi" : "❌ Rad etildi"}: ${esc(u?.name ?? "")} · ${p.amount.toLocaleString("ru-RU")} söm${approve && u?.until ? ` → ${u.until.toLocaleDateString("ru-RU")} gaça` : ""}`,
    { silent: true },
  );
  return p;
}

export async function myPayments(ctx: AppContext) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.userId, ctx.userId))
    .orderBy(desc(payments.createdAt))
    .limit(20);
}

export async function listPayments(ctx: AppContext) {
  if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
  return db
    .select({
      id: payments.id,
      amount: payments.amount,
      months: payments.months,
      method: payments.method,
      note: payments.note,
      status: payments.status,
      receiptFileId: payments.receiptFileId,
      createdAt: payments.createdAt,
      name: user.name,
      username: user.username,
      premiumUntil: user.premiumUntil,
    })
    .from(payments)
    .innerJoin(user, eq(user.id, payments.userId))
    .orderBy(desc(payments.createdAt))
    .limit(100);
}

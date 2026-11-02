/**
 * The notification centre (bell, /notifications) and the Telegram link. A
 * notification is written by the server about something that already passed
 * its own checks, so it uses the owner connection; reading is the user's own.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db, withUser, type AppContext } from "@/db";
import { botUsers, notifications, user } from "@/db/schema";
import type { Locale } from "@/i18n/config";
import { AppError } from "@/lib/errors";
import { NOTIFY_KEYS, PREF_OF, readPrefs, type NotifyKey } from "@/lib/notify-prefs";
import { esc, tgTo } from "./monitor/telegram";
import { pushTo } from "./push";
import { hitRateLimit } from "./rate-limit";

export type Kind = keyof typeof PREF_OF;
const KEEP_DAYS = 60;
const site = () => process.env.BETTER_AUTH_URL ?? "https://nodinest.vercel.app";

/** Tells a person something: the bell, and Telegram when it is linked and on. */
export async function notify(
  userId: string,
  kind: Kind,
  o: { actorId?: string | null; body?: string | null; href?: string | null } = {},
) {
  const [u] = await db
    .select({ notify: user.notify, locale: user.locale, name: user.name })
    .from(user)
    .where(eq(user.id, userId));
  if (!u) return;
  const prefs = readPrefs(u.notify);
  if (!prefs[PREF_OF[kind]]) return;
  // Following and unfollowing again and again rings once a day.
  if (o.actorId) {
    const [dup] = await db
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.kind, kind),
          eq(notifications.actorId, o.actorId),
          // A new message rings again once the last one was read.
          kind === "message"
            ? isNull(notifications.readAt)
            : sql`${notifications.createdAt} > now() - interval '1 day'`,
        ),
      );
    if (dup.n) return;
  }
  await db.insert(notifications).values({
    userId,
    kind,
    actorId: o.actorId ?? null,
    body: o.body ?? null,
    href: o.href ?? null,
  });
  // The words are made only when something will carry them.
  let said: string | null = null;
  const lineOf = async () => {
    if (said != null) return said;
    const [actor] = o.actorId
      ? await db.select({ name: user.name }).from(user).where(eq(user.id, o.actorId))
      : [];
    const t = await getTranslations({ locale: u.locale as Locale, namespace: "notifications" });
    said = t(`kind.${kind}` as "kind.follow", { name: actor?.name ?? "" });
    return said;
  };
  // The phone / computer, even with the site closed (browsers that were allowed).
  await pushTo(userId, { title: lineOf, body: o.body, url: o.href, tag: kind }).catch(() => null);
  if (!prefs.telegram) return;
  const [bot] = await db
    .select({ tg: botUsers.tgId })
    .from(botUsers)
    .where(and(eq(botUsers.userId, userId), eq(botUsers.blocked, false)));
  if (!bot) return;
  const line = await lineOf();
  const text = [line, o.body].filter(Boolean).join("\n");
  await tgTo(bot.tg, esc(text) + (o.href ? `\n\n${site()}${o.href}` : "")).catch(() => null);
}

/** An announcement to everyone who keeps "news" on (from /hammaga). */
export async function notifyEveryone(body: string) {
  await db.execute(sql`
    insert into nodinest.notifications (user_id, kind, body)
    select id, 'news', ${body.slice(0, 2000)} from nodinest."user"
    where status = 'active' and coalesce((notify->>'news')::boolean, true)`);
}

export async function listNotifications(ctx: AppContext) {
  return withUser(db, ctx, async (tx) => {
    await tx
      .delete(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.userId),
          lt(notifications.createdAt, sql`now() - make_interval(days => ${KEEP_DAYS})`),
        ),
      );
    return tx
      .select({
        id: notifications.id,
        kind: notifications.kind,
        body: notifications.body,
        href: notifications.href,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        actorId: notifications.actorId,
      })
      .from(notifications)
      .where(eq(notifications.userId, ctx.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
  });
}

export async function unreadCount(ctx: AppContext) {
  const [r] = await withUser(db, ctx, (tx) =>
    tx
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt))),
  );
  return r?.n ?? 0;
}

export async function markAllRead(ctx: AppContext) {
  await withUser(db, ctx, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt))),
  );
}

export async function deleteNotifications(ctx: AppContext, ids: string[]) {
  const list = z.array(z.string().uuid()).min(1).max(100).parse(ids);
  await withUser(db, ctx, (tx) =>
    tx
      .delete(notifications)
      .where(and(eq(notifications.userId, ctx.userId), inArray(notifications.id, list))),
  );
}

export async function setNotifyPref(ctx: AppContext, key: NotifyKey, on: boolean) {
  if (!NOTIFY_KEYS.includes(key)) throw new AppError("VALIDATION", "key");
  await withUser(db, ctx, (tx) =>
    tx
      .update(user)
      .set({ notify: sql`${user.notify} || ${JSON.stringify({ [key]: on })}::jsonb` })
      .where(eq(user.id, ctx.userId)),
  );
}

// ── Linking the Telegram bot ───────────────────────────────────────────────

const LINK_MINUTES = 15;
const linkKey = () => process.env.BETTER_AUTH_SECRET ?? "";
const sign = (payload: Buffer) =>
  createHmac("sha256", linkKey()).update("bot-link").update(payload).digest().subarray(0, 12);

/** A one-use code for t.me/<bot>?start=link_<code> (≤ 64 characters in all). */
export function botLinkCode(userId: string, now = Date.now()) {
  if (!linkKey()) throw new AppError("VALIDATION", "secret");
  const until = Buffer.alloc(4);
  until.writeUInt32BE(Math.floor(now / 1000) + LINK_MINUTES * 60);
  const payload = Buffer.concat([Buffer.from(userId.replaceAll("-", ""), "hex"), until]);
  return Buffer.concat([payload, sign(payload)]).toString("base64url");
}

function readLinkCode(code: string, now = Date.now()) {
  const raw = Buffer.from(code, "base64url");
  if (raw.length !== 32 || !linkKey()) return null;
  const payload = raw.subarray(0, 20);
  if (!timingSafeEqual(raw.subarray(20), sign(payload))) return null;
  if (payload.readUInt32BE(16) * 1000 < now) return null;
  const hex = payload.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** From the bot: ties this Telegram account to the site account. */
export async function redeemBotLink(tgId: number, code: string) {
  const userId = readLinkCode(code);
  if (!userId) return null;
  if (!(await hitRateLimit(db, `bot-link:${code}`, 1, LINK_MINUTES * 60)).allowed) return null;
  const [u] = await db
    .select({ name: user.name })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.status, "active")));
  if (!u) return null;
  await db.update(botUsers).set({ userId: null }).where(eq(botUsers.userId, userId));
  await db.update(botUsers).set({ userId }).where(eq(botUsers.tgId, tgId));
  return u.name;
}

export async function botStatus(ctx: AppContext) {
  const [b] = await db
    .select({ username: botUsers.username, firstName: botUsers.firstName })
    .from(botUsers)
    .where(eq(botUsers.userId, ctx.userId));
  return { linked: !!b, name: b ? (b.username ? `@${b.username}` : (b.firstName ?? "")) : null };
}

export async function unlinkBot(ctx: AppContext) {
  await db.update(botUsers).set({ userId: null }).where(eq(botUsers.userId, ctx.userId));
}

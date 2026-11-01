/**
 * In without Google, or without the password: a 6-digit code goes to the
 * account's e-mail and linked Telegram bot. Who has no account yet and asks to
 * sign up gets one by the same steps; "forgot password" sends nothing to an
 * e-mail with no account. An e-mail typed by hand gets the same answer either
 * way, so the form cannot be used to learn who has an account (usernames are
 * public anyway). The code is stored hashed, lives 10 minutes and allows 5
 * tries; a right code leads to a password, which ends every other session. The
 * superadmin account signs in with Google only, so it has no reset.
 */
import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { account, botUsers, session, user, verification } from "@/db/schema";
import { auth } from "@/lib/auth/config";
import { AppError } from "@/lib/errors";
import { maskEmail } from "@/lib/mask-email";
import { passwordOk } from "@/lib/password";
import { normalizeUsername } from "@/lib/username";
import { later } from "./later";
import { codeMail, mailConfigured, sendMail } from "./mail";
import { tgTo } from "./monitor/telegram";
import { hitRateLimit } from "./rate-limit";

const TTL = 10 * 60_000;
const MAX_TRIES = 5;
const keyOf = (userId: string) => `pw-reset:${userId}`;
/** A new account has no id yet: its code is kept under the e-mail. */
const newKey = (email: string) =>
  `pw-signup:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`;
const isEmail = (s: string) => z.string().email().max(120).safeParse(s).success;
const hashOf = (userId: string, code: string) =>
  createHash("sha256").update(`${process.env.BETTER_AUTH_SECRET}:${userId}:${code}`).digest("hex");

async function find(login: string) {
  const name = normalizeUsername(login).slice(0, 120);
  const [u] = await db
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      locale: user.locale,
    })
    .from(user)
    .where(sql`lower(${user.username}) = ${name} or lower(${user.email}) = ${name}`)
    .limit(1);
  return u && u.role !== "superadmin" && u.status === "active" ? { ...u, name } : null;
}

const TG = {
  uz: (c: string) =>
    `🔐 Parolni tiklaş kodi: <b>${c}</b>\n\nKod 10 daqiqa amal qiladi. Bu siz bölmasangiz, hech kimga aytmang.`,
  ru: (c: string) =>
    `🔐 Код для сброса пароля: <b>${c}</b>\n\nДействует 10 минут. Если это не вы, никому его не сообщайте.`,
  en: (c: string) =>
    `🔐 Password reset code: <b>${c}</b>\n\nValid for 10 minutes. If this wasn’t you, tell it to no one.`,
};

/** Where the code went, for the form: a masked e-mail, the bot, or nowhere. */
export type ResetAnswer = { to: string | null; bot: boolean };

export async function requestReset(
  login: string,
  opts: { signup?: boolean } = {},
): Promise<ResetAnswer> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const name = normalizeUsername(login).slice(0, 120);
  const a = await hitRateLimit(db, `reset-ip:${ip}`, 10, 3600);
  const b = await hitRateLimit(db, `reset-name:${name}`, 3, 3600);
  if (!a.allowed || !b.allowed) throw new AppError("RATE_LIMITED");
  const u = await find(login);
  if (!u) {
    const email = login.trim().toLowerCase();
    if (opts.signup && isEmail(email) && !(await taken(email))) await sendNewCode(email);
    return { to: login.includes("@") ? maskEmail(login.trim()) : null, bot: false };
  }
  // A username and an e-mail name the same person.
  if (!(await hitRateLimit(db, `reset-user:${u.id}`, 3, 3600)).allowed)
    throw new AppError("RATE_LIMITED");
  const code = String(randomInt(100_000, 1_000_000));
  await db.delete(verification).where(eq(verification.identifier, keyOf(u.id)));
  await db.insert(verification).values({
    identifier: keyOf(u.id),
    value: JSON.stringify({ h: hashOf(u.id, code), tries: 0 }),
    expiresAt: new Date(Date.now() + TTL),
  });
  const hasMail = !u.email.endsWith(".invalid");
  // After the answer: its speed must not tell whether the account exists.
  later(async () => {
    if (mailConfigured() && hasMail)
      await sendMail({ to: u.email, ...codeMail(code, u.locale, "reset") }).catch((e) =>
        console.error("[nodinest] reset mail failed:", e instanceof Error ? e.message : e),
      );
    const [bot] = await db
      .select({ tg: botUsers.tgId })
      .from(botUsers)
      .where(and(eq(botUsers.userId, u.id), eq(botUsers.blocked, false)));
    if (bot) {
      const say = u.locale === "ru" ? TG.ru : u.locale === "en" ? TG.en : TG.uz;
      await tgTo(bot.tg, say(code)).catch(() => null);
    }
  });
  return { to: hasMail ? maskEmail(u.email) : null, bot: !hasMail };
}

/** An e-mail that belongs to anyone at all, active or not. */
async function taken(email: string) {
  const [u] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);
  return !!u;
}

async function sendNewCode(email: string) {
  const code = String(randomInt(100_000, 1_000_000));
  const id = newKey(email);
  await db.delete(verification).where(eq(verification.identifier, id));
  await db.insert(verification).values({
    identifier: id,
    value: JSON.stringify({ h: hashOf(id, code), tries: 0 }),
    expiresAt: new Date(Date.now() + TTL),
  });
  later(async () => {
    if (mailConfigured())
      await sendMail({ to: email, ...codeMail(code, "uz") }).catch((e) =>
        console.error("[nodinest] sign-up mail failed:", e instanceof Error ? e.message : e),
      );
  });
}

/** The code's row when it is right; a wrong one uses up a try. */
async function rightCode(login: string, code: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!(await hitRateLimit(db, `reset-try-ip:${ip}`, 30, 3600)).allowed)
    throw new AppError("RATE_LIMITED");
  const u = await find(login);
  const email = login.trim().toLowerCase();
  // No such account: a sign-up code is the only thing it can be.
  const id = u?.id ?? (isEmail(email) && !(await taken(email)) ? newKey(email) : null);
  const key = u ? keyOf(u.id) : id;
  const bad = new AppError("VALIDATION", "bad_code");
  if (!id || !key) throw bad;
  // Counted before comparing, so guesses sent at once cannot share one try.
  if (!(await hitRateLimit(db, `reset-try:${id}`, MAX_TRIES * 2, 3600)).allowed)
    throw new AppError("RATE_LIMITED");
  const [row] = await db.select().from(verification).where(eq(verification.identifier, key));
  if (!row || row.expiresAt < new Date()) throw bad;
  const v = JSON.parse(row.value) as { h: string; tries: number };
  const got = Buffer.from(hashOf(id, code.trim()));
  const want = Buffer.from(v.h);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    if (v.tries + 1 >= MAX_TRIES) await db.delete(verification).where(eq(verification.id, row.id));
    else
      await db
        .update(verification)
        .set({ value: JSON.stringify({ ...v, tries: v.tries + 1 }) })
        .where(eq(verification.id, row.id));
    throw bad;
  }
  return { u, email, row };
}

/** The code alone: a right one opens the step with the new password. */
export async function checkReset(login: string, code: string) {
  await rightCode(login, code);
}

export async function confirmReset(login: string, code: string, password: string) {
  if (!passwordOk(password)) throw new AppError("VALIDATION", "weak_password");
  const { u, email, row } = await rightCode(login, code);
  const c = await auth.$context;
  const hash = await c.password.hash(password);
  if (!u) {
    // The code proved the address is theirs. The name is asked at /welcome.
    const made = await c.internalAdapter.createUser(
      { email, name: email.split("@")[0], emailVerified: true },
      { method: "email-password" },
    );
    await c.internalAdapter.linkAccount({
      userId: made.id,
      providerId: "credential",
      accountId: made.id,
      password: hash,
    });
    await db.delete(verification).where(eq(verification.id, row.id));
    return;
  }
  const [has] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));
  if (has) await c.internalAdapter.updatePassword(u.id, hash);
  else
    await c.internalAdapter.linkAccount({
      userId: u.id,
      providerId: "credential",
      accountId: u.id,
      password: hash,
    });
  await db.delete(verification).where(eq(verification.id, row.id));
  await db.delete(session).where(eq(session.userId, u.id));
}

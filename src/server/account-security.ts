/**
 * Password sign-in by username, setting / changing the password, and the
 * devices (sessions) of an account: at most two at a time. The superadmin
 * account signs in with Google only (its role comes from the Google-verified
 * e-mail), so a password can never open it.
 */
import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, type AppContext } from "@/db";
import { account, session, user } from "@/db/schema";
import { auth } from "@/lib/auth/config";
import { AppError } from "@/lib/errors";
import { passwordOk } from "@/lib/password";
import { normalizeUsername } from "@/lib/username";
import { hitRateLimit } from "./rate-limit";

export const MAX_DEVICES = 2;

const ipOf = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

export async function hasPassword(userId: string) {
  const [a] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
  return !!a;
}

/** Username (or e-mail) + password. The same answer for every failure. */
export async function loginWithPassword(login: string, password: string) {
  const h = await headers();
  const name = normalizeUsername(login).slice(0, 120);
  const ip = ipOf(h);
  const a = await hitRateLimit(db, `login-ip:${ip}`, 30, 600);
  const b = await hitRateLimit(db, `login-name:${name}`, 8, 600);
  if (!a.allowed || !b.allowed) throw new AppError("RATE_LIMITED");
  const [u] = await db
    .select({ email: user.email, role: user.role })
    .from(user)
    .where(sql`lower(${user.username}) = ${name} or lower(${user.email}) = ${name}`)
    .limit(1);
  if (!u || u.role === "superadmin" || password.length > 128)
    throw new AppError("VALIDATION", "bad_login");
  try {
    await auth.api.signInEmail({ body: { email: u.email, password }, headers: h });
  } catch {
    throw new AppError("VALIDATION", "bad_login");
  }
}

/** First password of an account (Google / e-mail code users). */
export async function setFirstPassword(ctx: AppContext, password: string) {
  if (!passwordOk(password)) throw new AppError("VALIDATION", "weak_password");
  if (ctx.superadminAccount) throw new AppError("FORBIDDEN", "superadmin");
  if (await hasPassword(ctx.userId)) throw new AppError("CONFLICT", "has_password");
  await auth.api.setPassword({ body: { newPassword: password }, headers: await headers() });
}

export async function changePassword(ctx: AppContext, current: string, next: string) {
  if (!passwordOk(next)) throw new AppError("VALIDATION", "weak_password");
  if (ctx.superadminAccount) throw new AppError("FORBIDDEN", "superadmin");
  const h = await headers();
  if (!(await hitRateLimit(db, `pw-change:${ctx.userId}`, 8, 3600)).allowed)
    throw new AppError("RATE_LIMITED");
  try {
    await auth.api.changePassword({
      body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
      headers: h,
    });
  } catch {
    throw new AppError("VALIDATION", "bad_password");
  }
}

function deviceName(ua: string | null) {
  const u = ua ?? "";
  const os = /iPhone|iPad/.test(u)
    ? "iOS"
    : /Android/.test(u)
      ? "Android"
      : /Mac OS X/.test(u)
        ? "macOS"
        : /Windows/.test(u)
          ? "Windows"
          : /Linux/.test(u)
            ? "Linux"
            : "";
  const app = /NodiNest|NodiNote/.test(u) ? "NodiNote" : "";
  const br = /Edg\//.test(u)
    ? "Edge"
    : /OPR\//.test(u)
      ? "Opera"
      : /YaBrowser/.test(u)
        ? "Yandex"
        : /Chrome\//.test(u)
          ? "Chrome"
          : /Firefox\//.test(u)
            ? "Firefox"
            : /Safari\//.test(u)
              ? "Safari"
              : "";
  return { name: app || br || "?", os, phone: /iPhone|Android.*Mobile/.test(u) };
}

export async function listDevices(ctx: AppContext) {
  const s = await auth.api.getSession({ headers: await headers() });
  const rows = await db
    .select({
      id: session.id,
      userAgent: session.userAgent,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
    })
    .from(session)
    .where(and(eq(session.userId, ctx.userId), sql`${session.expiresAt} > now()`))
    .orderBy(desc(session.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    ...deviceName(r.userAgent),
    lastSeen: r.updatedAt,
    current: r.id === s?.session.id,
  }));
}

export async function removeDevice(ctx: AppContext, id: string) {
  await db.delete(session).where(and(eq(session.id, id), eq(session.userId, ctx.userId)));
}

/** A new sign-in pushes out the oldest device beyond the limit. */
export async function enforceDeviceLimit(userId: string, keepId: string) {
  const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  if (u?.role === "superadmin") return;
  const rest = await db
    .select({ id: session.id })
    .from(session)
    .where(and(eq(session.userId, userId), ne(session.id, keepId)))
    .orderBy(desc(session.updatedAt));
  for (const s of rest.slice(MAX_DEVICES - 1)) await db.delete(session).where(eq(session.id, s.id));
}

/** The device's time zone (the browser tells it; never asked from the user). */
export async function syncTimezone(ctx: AppContext, tz: string) {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) || tz.length > 64) return;
  if (!Intl.supportedValuesOf("timeZone").includes(tz)) return;
  await db.update(user).set({ timezone: tz }).where(eq(user.id, ctx.userId));
}

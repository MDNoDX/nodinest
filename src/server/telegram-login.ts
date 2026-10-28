/**
 * Sign-in with the Telegram bot (no phone number, no code from Telegram):
 *  1. the browser asks for a one-time code; its hash and the hash of a secret
 *     httpOnly cookie of THAT browser are stored (10 min);
 *  2. the user opens t.me/<bot>?start=login_<code> and presses "Confirm" in the
 *     bot, which sees the device that asks (the webhook approves the code);
 *  3. the waiting page polls; only the browser holding the cookie can redeem
 *     the approved code, once.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { telegramLogins } from "@/db/schema";

export const LOGIN_TTL_MS = 10 * 60_000;
export const BROWSER_COOKIE = "nn_tg_login";

export type TgUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const CODE_RE = /^[A-Za-z0-9_-]{43}$/;

/** A short description of the browser asking ("Chrome · macOS"). */
export function deviceOf(ua: string) {
  const b = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /YaBrowser/.test(ua)
        ? "Yandex"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : /NodiNest/i.test(ua)
                ? "NodiNote Mac"
                : "Brauzer";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return [b, os].filter(Boolean).join(" · ");
}

export async function createLoginCode(userAgent: string) {
  const code = randomBytes(32).toString("base64url");
  const browser = randomBytes(32).toString("base64url");
  await db.delete(telegramLogins).where(lt(telegramLogins.expiresAt, new Date()));
  await db.insert(telegramLogins).values({
    codeHash: sha(code),
    browserHash: sha(browser),
    device: deviceOf(userAgent).slice(0, 80),
    expiresAt: new Date(Date.now() + LOGIN_TTL_MS),
  });
  return { code, browser };
}

/** The bot: what to show before confirming (null = expired or used). */
export async function pendingLogin(code: string) {
  if (!CODE_RE.test(code)) return null;
  const [row] = await db
    .select({ device: telegramLogins.device, approvedAt: telegramLogins.approvedAt })
    .from(telegramLogins)
    .where(
      and(
        eq(telegramLogins.codeHash, sha(code)),
        gt(telegramLogins.expiresAt, new Date()),
        isNull(telegramLogins.usedAt),
      ),
    );
  return row ?? null;
}

/** The bot: the person confirmed. True when the code was waiting. */
export async function approveLogin(code: string, tg: TgUser) {
  if (!CODE_RE.test(code)) return false;
  const rows = await db
    .update(telegramLogins)
    .set({ tgUser: tg, approvedAt: new Date() })
    .where(
      and(
        eq(telegramLogins.codeHash, sha(code)),
        gt(telegramLogins.expiresAt, new Date()),
        isNull(telegramLogins.approvedAt),
      ),
    )
    .returning({ c: telegramLogins.codeHash });
  return rows.length > 0;
}

/** The bot: the person refused; the code can no longer be used. */
export async function cancelLogin(code: string) {
  if (!CODE_RE.test(code)) return;
  await db
    .update(telegramLogins)
    .set({ usedAt: new Date() })
    .where(eq(telegramLogins.codeHash, sha(code)));
}

/**
 * The waiting browser: "pending" until confirmed, then the Telegram user once
 * (the code is used up). "gone" = expired, refused or another browser's code.
 */
export async function redeemLogin(
  code: string,
  browser: string | undefined,
): Promise<{ state: "pending" } | { state: "gone" } | { state: "ok"; tg: TgUser }> {
  if (!CODE_RE.test(code) || !browser) return { state: "gone" };
  const [row] = await db
    .select()
    .from(telegramLogins)
    .where(eq(telegramLogins.codeHash, sha(code)));
  if (!row || row.browserHash !== sha(browser) || row.usedAt || row.expiresAt < new Date())
    return { state: "gone" };
  if (!row.approvedAt || !row.tgUser) return { state: "pending" };
  const used = await db
    .update(telegramLogins)
    .set({ usedAt: new Date() })
    .where(and(eq(telegramLogins.codeHash, row.codeHash), isNull(telegramLogins.usedAt)))
    .returning({ c: telegramLogins.codeHash });
  if (!used.length) return { state: "gone" };
  return { state: "ok", tg: row.tgUser as TgUser };
}

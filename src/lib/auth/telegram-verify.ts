/**
 * Telegram Login (https://core.telegram.org/widgets/login#checking-authorization):
 * the data is signed with HMAC-SHA256 whose key is SHA-256(bot token). Pure.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

/** Accepted only when the signature matches and it is at most `maxAgeS` old. */
export function verifyTelegram(
  data: Record<string, unknown>,
  botToken: string,
  now = Date.now(),
  maxAgeS = 3600,
): TelegramUser | null {
  const hash = typeof data.hash === "string" ? data.hash : "";
  if (!/^[0-9a-f]{64}$/.test(hash) || !botToken) return null;
  const check = Object.keys(data)
    .filter((k) => k !== "hash" && data[k] != null && data[k] !== "")
    .sort()
    .map((k) => `${k}=${String(data[k])}`)
    .join("\n");
  const key = createHash("sha256").update(botToken).digest();
  const want = createHmac("sha256", key).update(check).digest();
  if (!timingSafeEqual(want, Buffer.from(hash, "hex"))) return null;
  const id = Number(data.id);
  const at = Number(data.auth_date);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(at)) return null;
  if (now / 1000 - at > maxAgeS || at - now / 1000 > 60) return null;
  return { ...(data as TelegramUser), id, auth_date: at };
}

/** The numeric bot id is the part of the token before the colon. */
export const botIdOf = (token: string) => /^(\d+):/.exec(token)?.[1] ?? null;

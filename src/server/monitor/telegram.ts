/**
 * The admin's Telegram channel: user messages, new accounts, server errors and
 * a daily summary are posted there by the site's bot. Needs TELEGRAM_BOT_TOKEN
 * and TELEGRAM_ADMIN_CHAT_ID (the bot must be an admin of that channel).
 * Never throws: monitoring must not break the request that triggered it.
 */
import "server-only";

const API = "https://api.telegram.org";
const MAX_TEXT = 4000;

export const tgConfigured = () =>
  !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_ADMIN_CHAT_ID;

/** Escapes text for Telegram's HTML parse mode. */
export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Secrets that could appear in an error text are masked before they leave. */
export function redact(s: string) {
  return s
    .replace(/postgres(ql)?:\/\/[^\s"'`]+/gi, "postgres://***")
    .replace(/\b(bot)?\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, "***token***")
    .replace(/\b(AIza[0-9A-Za-z_-]{30,})\b/g, "***key***")
    .replace(
      /(authorization|cookie|bearer|secret|password|token|api[_-]?key)(["'\s:=]+)[^\s"',;]+/gi,
      "$1$2***",
    )
    .replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "***blob***");
}

async function call(method: string, body: BodyInit, json = true) {
  return (await tgRaw(method, body, json)) !== null;
}

/** Any Bot API method; the `result` on success, null on any failure. */
export async function tgRaw<T = unknown>(
  method: string,
  body: BodyInit | Record<string, unknown>,
  json = true,
): Promise<T | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: json ? { "content-type": "application/json" } : undefined,
      body:
        json && typeof body === "object" && !(body instanceof FormData)
          ? JSON.stringify(body)
          : (body as BodyInit),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T } | null;
    return data?.ok ? (data.result ?? (true as T)) : null;
  } catch {
    return null;
  }
}

/** Sends to any chat (a user of the bot); returns the message id or null. */
export async function tgTo(
  chatId: number | string,
  html: string,
  extra: Record<string, unknown> = {},
) {
  const r = await tgRaw<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: html.slice(0, MAX_TEXT),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
  return r?.message_id ?? null;
}

/** The webhook's secret header value, derived from the token (no extra env). */
export async function webhookSecret() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`nn-webhook:${token}`).digest("hex").slice(0, 48);
}

let botName: string | null = null;
/** @username of the bot (asked once per instance). */
export async function botUsername() {
  if (botName) return botName;
  if (process.env.TELEGRAM_BOT_USERNAME) return (botName = process.env.TELEGRAM_BOT_USERNAME);
  const me = await tgRaw<{ username: string }>("getMe", {});
  botName = me?.username ?? null;
  return botName;
}

/** Posts an HTML message (cut to Telegram's limit) to the admin channel; its message id. */
export async function tgSend(html: string, opts: { silent?: boolean } = {}) {
  if (!tgConfigured()) return null;
  const text = html.length > MAX_TEXT ? `${html.slice(0, MAX_TEXT)}…` : html;
  return tgTo(process.env.TELEGRAM_ADMIN_CHAT_ID!, text, {
    disable_notification: !!opts.silent,
  });
}

/** Posts a text file (e.g. a full stack trace) with a short caption. */
export async function tgDocument(name: string, content: string, caption: string) {
  if (!tgConfigured()) return false;
  const form = new FormData();
  form.set("chat_id", process.env.TELEGRAM_ADMIN_CHAT_ID!);
  form.set("caption", caption.slice(0, 1000));
  form.set("parse_mode", "HTML");
  form.set("document", new Blob([content], { type: "text/plain" }), name);
  return call("sendDocument", form, false);
}

/** Where this server runs (shown under every report). */
export function envLine() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return [process.env.VERCEL_ENV ?? "local", process.env.VERCEL_REGION, sha]
    .filter(Boolean)
    .join(" · ");
}

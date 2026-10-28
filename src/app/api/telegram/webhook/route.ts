import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { handleUpdate } from "@/server/bot/webhook";
import { reportError } from "@/server/monitor/report";
import { webhookSecret } from "@/server/monitor/telegram";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Telegram → the bot. Only requests carrying our secret header are accepted. */
export async function POST(req: NextRequest) {
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(await webhookSecret());
  if (!process.env.TELEGRAM_BOT_TOKEN || got.length !== want.length || !timingSafeEqual(got, want))
    return new Response("forbidden", { status: 403 });
  try {
    await handleUpdate(await req.json());
  } catch (err) {
    await reportError(err, { where: "telegram webhook" });
  }
  // Always 200: a failing update must not be re-sent by Telegram forever.
  return new Response("ok");
}

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { sendReminders } from "@/server/roznoma";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Röznoma reminders in Telegram, called every few minutes by the GitHub
 * Actions schedule (.github/workflows/reminders.yml) with the CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want))
    return new Response("forbidden", { status: 403 });
  const sent = await sendReminders();
  return new Response(`ok ${sent}`);
}

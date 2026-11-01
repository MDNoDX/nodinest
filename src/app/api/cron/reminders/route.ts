import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { hitRateLimit } from "@/server/rate-limit";
import { sendReminders } from "@/server/roznoma";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Röznoma reminders in Telegram, called every few minutes by the GitHub
 * Actions schedule (.github/workflows/reminders.yml). No secret is needed:
 * a run only sends what is due (each reminder once a day), and runs are
 * limited to one per two minutes for everyone, so calling it does no harm.
 * With the CRON_SECRET header it always runs.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  const trusted = !!secret && got.length === want.length && timingSafeEqual(got, want);
  if (!trusted && !(await hitRateLimit(db, "cron-reminders", 1, 110)).allowed)
    return new Response("later", { status: 429 });
  const sent = await sendReminders();
  return new Response(`ok ${sent}`);
}

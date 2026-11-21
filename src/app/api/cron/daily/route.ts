import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { formatWaiting } from "@/server/book-format";
import { dailySummary } from "@/server/monitor/summary";
import { dailyNudges, sendReminders } from "@/server/roznoma";
import { sweepOrphanBlobs } from "@/server/storage";
import { moveWaiting } from "@/server/tg-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The daily job, started by the Netlify scheduled function
 * (netlify/functions/cron-daily.mts). Netlify gives a function 60 s, so the
 * slow steps get small budgets; what is left waits for the next day.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want))
    return new Response("forbidden", { status: 403 });
  // Big files still in Blob move to the Telegram store, then the summary.
  await moveWaiting(20_000, 5).catch(() => 0);
  await sweepOrphanBlobs().catch((e) => console.error("sweep", e));
  await dailyNudges().catch((e) => console.error("nudges", e));
  // A sure run in the morning (09:00-10:00 in Tashkent): the day's plan list
  // arrives even when the minute cron is down (it is sent once a day anyway).
  await sendReminders().catch((e) => console.error("reminders", e));
  await formatWaiting().catch(() => {});
  await dailySummary();
  return new Response("ok");
}

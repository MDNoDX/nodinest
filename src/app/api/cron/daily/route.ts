import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dailySummary } from "@/server/monitor/summary";
import { dailyNudges, sendReminders } from "@/server/roznoma";
import { sweepOrphanBlobs } from "@/server/storage";
import { moveWaiting } from "@/server/tg-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Vercel cron (vercel.json): the daily summary to the admin channel. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want))
    return new Response("forbidden", { status: 403 });
  // Big files still in Blob move to the Telegram store, then the summary.
  await moveWaiting(200_000).catch(() => 0);
  await sweepOrphanBlobs().catch((e) => console.error("sweep", e));
  await dailyNudges().catch((e) => console.error("nudges", e));
  // A sure run in the morning (09:00-10:00 in Tashkent): the day's plan list
  // arrives even when the minute cron is down (it is sent once a day anyway).
  await sendReminders().catch((e) => console.error("reminders", e));
  await dailySummary();
  return new Response("ok");
}

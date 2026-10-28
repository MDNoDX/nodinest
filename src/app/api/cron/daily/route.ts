import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dailySummary } from "@/server/monitor/summary";
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
  await dailySummary();
  return new Response("ok");
}

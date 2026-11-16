import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { dueNow } from "@/lib/remind-due";
import { formatWaiting } from "@/server/book-format";
import { hitRateLimit } from "@/server/rate-limit";
import { remindPlans } from "@/server/remind-schedule";
import { sendReminders } from "@/server/roznoma";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Röznoma plan messages in Telegram (`sendReminders`), called every minute by
 * an outside cron (cron-job.org) and, less reliably, by the GitHub Actions
 * schedule (.github/workflows/reminders.yml). No secret is needed: a run only
 * sends what is due (each message once a day), and runs are limited to one
 * per 50 seconds for everyone, so calling it does no harm. With the
 * CRON_SECRET header it always runs.
 *
 * Most minutes nothing is due: the cached list of moments (server/remind-schedule)
 * answers without touching the database, so Neon can sleep (its free compute
 * would not last the month if every minute woke it).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  const trusted = !!secret && got.length === want.length && timingSafeEqual(got, want);
  if (!trusted) {
    const plans = await remindPlans().catch(() => null);
    if (plans && !dueNow(plans, new Date())) return new Response("idle");
    if (!(await hitRateLimit(db, "cron-reminders", 1, 50)).allowed)
      return new Response("later", { status: 429 });
  }
  const sent = await sendReminders();
  // The database is awake anyway: books not laid out for reading go on a little
  // (AI: at most once per five minutes).
  if ((await hitRateLimit(db, "cron-format", 1, 290)).allowed)
    await formatWaiting().catch(() => {});
  return new Response(`ok ${sent}`);
}

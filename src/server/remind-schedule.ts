import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/db";
import { botUsers, routines, user } from "@/db/schema";
import { readPlanTimes, readPrefs } from "@/lib/notify-prefs";
import type { RemindPlan } from "@/lib/remind-due";

const TAG = "remind-plans";

/**
 * Every moment a plan message may be due (lib/remind-due.ts), kept in Next's
 * cache (outside the database) so the every-minute cron does not wake Neon.
 * A superset is fine: sendReminders decides what really goes. Rebuilt at most
 * every 6 hours, or at once after a change that can add a moment.
 */
export const remindPlans = unstable_cache(
  async (): Promise<RemindPlan[]> => {
    const people = await db
      .select({ userId: user.id, tz: user.timezone, notify: user.notify })
      .from(botUsers)
      .innerJoin(user, eq(user.id, botUsers.userId))
      .where(and(eq(botUsers.blocked, false), eq(user.status, "active")));
    const on = people.filter((p) => {
      const prefs = readPrefs(p.notify);
      return prefs.plans && prefs.telegram;
    });
    if (!on.length) return [];
    const timed = await db
      .select({ userId: routines.userId, time: routines.time })
      .from(routines)
      .where(
        and(
          inArray(
            routines.userId,
            on.map((p) => p.userId),
          ),
          isNotNull(routines.time),
          eq(routines.alarm, true),
          eq(routines.archived, false),
        ),
      );
    return on.map((p) => {
      const t = readPlanTimes(p.notify);
      const at = new Set<string>();
      if (t.morningAt) at.add(t.morningAt);
      if (t.eveningAt) at.add(t.eveningAt);
      for (const r of timed) if (r.userId === p.userId && r.time) at.add(r.time.slice(0, 5));
      return { tz: p.tz || "Asia/Tashkent", at: [...at] };
    });
  },
  ["remind-plans-v1"],
  { tags: [TAG], revalidate: 6 * 3600 },
);

/** A plan time, a switch, the bot link or the time zone changed: read again next minute. */
export function remindPlansChanged() {
  try {
    revalidateTag(TAG, { expire: 0 });
  } catch {
    /* outside a request (scripts, tests): the 6-hour rebuild covers it */
  }
}

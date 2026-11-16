/**
 * When a plan message may be due, without the database.
 *
 * The outside cron calls /api/cron/reminders every minute. Waking the database
 * that often keeps Neon's free compute running all month (100 CU-hours are
 * not enough for that), so the route first looks at a small cached list of
 * the moments people asked for (morning list, evening summary, timed plans)
 * and touches the database only when one of them has just come.
 */
export type RemindPlan = {
  /** The person's time zone. */
  tz: string;
  /** "HH:MM" moments in that zone. */
  at: string[];
};

const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** The minute of the day (0-1439) in `tz` at `now`. */
export function localMinute(now: Date, tz: string): number {
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return mins(hm);
}

/** True when one of the moments came in the last `span` minutes (midnight included). */
export function dueNow(plans: RemindPlan[], now: Date, span = 3): boolean {
  for (const p of plans) {
    let m: number;
    try {
      m = localMinute(now, p.tz);
    } catch {
      m = localMinute(now, "UTC");
    }
    for (const at of p.at) {
      if (!/^\d{2}:\d{2}$/.test(at)) continue;
      const ago = (m - mins(at) + 1440) % 1440;
      if (ago < span) return true;
    }
  }
  return false;
}

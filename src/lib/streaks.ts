import { addDays } from "./dates";

/**
 * Learning streaks over calendar days (in the user's time zone).
 * A day counts when it has at least one completed session with > 0 active
 * seconds. The current streak may end today or yesterday (today not yet
 * studied doesn't break it); otherwise it is 0.
 */
export function computeStreaks(
  activeDays: Iterable<string>,
  today: string,
): { current: number; longest: number } {
  const days = new Set(activeDays);
  if (days.size === 0) return { current: 0, longest: 0 };

  let current = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

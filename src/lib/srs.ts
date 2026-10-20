/**
 * Spaced repetition (SM-2 style). grade: 1 again, 2 hard, 3 good, 4 easy.
 * intervalDays 10/1440 ≈ "again in 10 minutes".
 */
export type Grade = 1 | 2 | 3 | 4;

export function schedule(c: { ease: number; intervalDays: number; reps: number }, grade: Grade) {
  let { ease, intervalDays: iv } = c;
  const { reps } = c;
  if (grade === 1)
    return { ease: Math.max(1.3, ease - 0.2), intervalDays: 10 / 1440, reps: 0, lapse: true };
  if (grade === 2) {
    iv = reps === 0 ? 1 : Math.max(1, iv * 1.2);
    ease = Math.max(1.3, ease - 0.15);
  } else if (grade === 3) {
    iv = reps === 0 ? 1 : reps === 1 ? 3 : iv * ease;
  } else {
    iv = reps === 0 ? 4 : Math.max(iv * ease * 1.3, iv + 1);
    ease += 0.15;
  }
  return { ease, intervalDays: Math.min(iv, 3650), reps: reps + 1, lapse: false };
}

/** "10 daq", "3 kun", "2 oy", "1,5 yil" — the next review time on a grade button. */
export function intervalLabel(days: number, locale: "uz" | "en") {
  const uz = locale === "uz";
  if (days < 1 / 24)
    return uz ? `${Math.round(days * 1440)} daq` : `${Math.round(days * 1440)} min`;
  if (days < 1) return uz ? `${Math.round(days * 24)} soat` : `${Math.round(days * 24)} h`;
  if (days < 30) return uz ? `${Math.round(days)} kun` : `${Math.round(days)} d`;
  if (days < 365) return uz ? `${Math.round(days / 30)} oy` : `${Math.round(days / 30)} mo`;
  const y = Math.round((days / 365) * 10) / 10;
  return uz ? `${String(y).replace(".", ",")} yil` : `${y} y`;
}

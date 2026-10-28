/**
 * Spaced repetition (SM-2 style). grade: 1 again, 2 hard, 3 good, 4 easy.
 * intervalDays 10/1440 ≈ "again in 10 minutes".
 */
export type Grade = 1 | 2 | 3 | 4;
import { type Locale } from "@/i18n/config";

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
export function intervalLabel(days: number, locale: Locale) {
  const u =
    locale === "uz"
      ? { m: "daq", h: "soat", d: "kun", mo: "oy", y: "yil" }
      : locale === "ru"
        ? { m: "мин", h: "ч", d: "дн", mo: "мес", y: "г" }
        : { m: "min", h: "h", d: "d", mo: "mo", y: "y" };
  if (days < 1 / 24) return `${Math.round(days * 1440)} ${u.m}`;
  if (days < 1) return `${Math.round(days * 24)} ${u.h}`;
  if (days < 30) return `${Math.round(days)} ${u.d}`;
  if (days < 365) return `${Math.round(days / 30)} ${u.mo}`;
  const y = Math.round((days / 365) * 10) / 10;
  return locale === "en" ? `${y} ${u.y}` : `${String(y).replace(".", ",")} ${u.y}`;
}

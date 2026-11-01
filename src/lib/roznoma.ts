/**
 * Röznoma helpers shared by the server and the browser (pure): which routines
 * fall on a day, the Hijri date, and the day's numbers.
 */

export type Repeat = "daily" | "weekly" | "once";
export type RoutineLike = {
  repeat: Repeat;
  weekdays: number[];
  onDay: string | null;
  archived?: boolean;
  startsOn?: string | null;
  endsOn?: string | null;
};

/** 1 = Monday … 7 = Sunday, for a "YYYY-MM-DD" day. */
export function isoWeekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Is this routine on the list of that day? */
export function dueOn(r: RoutineLike, day: string): boolean {
  if (r.archived) return false;
  if (r.repeat === "once") return r.onDay === day;
  if (r.startsOn && day < r.startsOn) return false;
  if (r.endsOn && day > r.endsOn) return false;
  if (r.repeat === "weekly") return r.weekdays.includes(isoWeekday(day));
  return true;
}

const HIJRI_UZ = [
  "Muharram",
  "Safar",
  "Rabiul avval",
  "Rabiul oxir",
  "Jumodil avval",
  "Jumodil oxir",
  "Rajab",
  "Şa’bon",
  "Ramazon",
  "Şavvol",
  "Zulqa’da",
  "Zulhijja",
];
const HIJRI_RU = [
  "Мухаррам",
  "Сафар",
  "Раби аль-авваль",
  "Раби ас-сани",
  "Джумада аль-уля",
  "Джумада ас-сани",
  "Раджаб",
  "Шаабан",
  "Рамадан",
  "Шавваль",
  "Зуль-када",
  "Зуль-хиджа",
];
const HIJRI_EN = [
  "Muharram",
  "Safar",
  "Rabi al-Awwal",
  "Rabi al-Thani",
  "Jumada al-Ula",
  "Jumada al-Akhirah",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qadah",
  "Dhu al-Hijjah",
];

/**
 * "21 Jumodil avval 1448", or "" if unsupported. Worked out on the device from
 * its own date. Umm al-Qura follows the real moon (the tabular "civil" calendar
 * was a day behind).
 */
export function hijriDate(day: string, locale: string): string {
  try {
    const [y, m, d] = day.split("-").map(Number);
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const hm = get("month");
    const names = locale === "ru" ? HIJRI_RU : locale === "en" ? HIJRI_EN : HIJRI_UZ;
    const name = names[hm - 1];
    const hy = String(get("year") || "");
    return name ? `${get("day")} ${name} ${hy}`.trim() : "";
  } catch {
    return "";
  }
}

/** How much of the awake day was productive (12 active hours = 100 %). */
export const ACTIVE_DAY_MINUTES = 12 * 60;
export const productivePercent = (minutes: number | null | undefined) =>
  minutes ? Math.min(100, Math.round((minutes / ACTIVE_DAY_MINUTES) * 100)) : 0;

export const percent = (done: number, total: number) =>
  total ? Math.round((done / total) * 100) : 0;

/** "HH:MM" (24 h), or null. */
export function normalizeTime(v: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
export type CheckStatus = "done" | "partial" | "skipped";

/** The number in an amount ("20 bet" → 20, "1.5 soat" → 1.5), or null. */
export function amountTarget(amount: string | null | undefined): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(amount ?? "");
  return m ? Number(m[1].replace(",", ".")) : null;
}

/**
 * How much of an item counts for the day, 0…1: done = 1, partial = the share
 * of the amount (or of 100 % when there is no number), skipped / not done = 0.
 */
export function itemScore(i: {
  status: CheckStatus | null;
  value: number | null;
  amount: string | null;
}): number {
  if (i.status === "done") return 1;
  if (i.status !== "partial" || i.value == null) return 0;
  const target = amountTarget(i.amount);
  return Math.max(0, Math.min(1, target ? i.value / target : i.value / 100));
}

/** The day's share done (skipped items with a reason do not count against it). */
export function dayPercent(
  items: { status: CheckStatus | null; value: number | null; amount: string | null }[],
) {
  const counted = items.filter((i) => i.status !== "skipped");
  if (!counted.length) return 0;
  return Math.round((counted.reduce((a, i) => a + itemScore(i), 0) / counted.length) * 100);
}

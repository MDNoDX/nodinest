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
  if (r.repeat === "weekly") return r.weekdays.includes(isoWeekday(day));
  return true;
}

const HIJRI_UZ = [
  "Muharram",
  "Safar",
  "Rabiul-avval",
  "Rabiul-oxir",
  "Jumodul-avval",
  "Jumodul-oxir",
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

/** "26 Rabiul-avval 1448" (tabular civil calendar — matches the Uzbek calendars), or "" if unsupported. */
export function hijriDate(day: string, locale: string): string {
  try {
    const [y, m, d] = day.split("-").map(Number);
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-civil-nu-latn", {
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

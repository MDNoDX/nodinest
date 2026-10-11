/** Date helpers. Days are always computed in the user's IANA time zone. */

/** Partial ISO date: "YYYY", "YYYY-MM" or "YYYY-MM-DD" (unknown parts omitted). */
export const PARTIAL_DATE_RE = /^-?\d{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

export function isValidPartialDate(v: string): boolean {
  if (!PARTIAL_DATE_RE.test(v)) return false;
  const parts = v.replace(/^-/, "").split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  return true;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar day (YYYY-MM-DD) of an instant in a time zone. */
export function dayKey(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Adds n days to a YYYY-MM-DD key (calendar arithmetic, DST-safe). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** ISO weekday 1 (Mon) … 7 (Sun) of a YYYY-MM-DD key. */
export function isoWeekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function startOfWeekKey(key: string): string {
  return addDays(key, 1 - isoWeekday(key));
}

export function formatPartialDate(v: string | null | undefined, locale: "uz" | "en"): string {
  if (!v) return "";
  const parts = v.split("-");
  if (v.startsWith("-")) return v;
  const [y, m, d] = parts.map(Number);
  const loc = locale === "uz" ? "uz-Latn-UZ" : "en-GB";
  if (parts.length === 1) return String(y);
  if (parts.length === 2)
    return new Intl.DateTimeFormat(loc, { year: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    );
  return new Intl.DateTimeFormat(loc, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

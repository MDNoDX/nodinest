/** Date helpers. Days are always computed in the user's IANA time zone. */

/** Partial ISO date: "YYYY", "YYYY-MM" or "YYYY-MM-DD" (unknown parts omitted). */
export const PARTIAL_DATE_RE = /^-?\d{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
import { type Locale } from "@/i18n/config";
import { intlTag } from "@/i18n/config";

/**
 * Flexible historical date (a small EDTF subset), stored as text:
 *   exact   "1499" | "1499-05" | "1499-05-12" (negative = BC)
 *   approx  "1150~"            ("taxminan 1150")
 *   range   "1100/1200"        ("1100–1200 oralig'ida"; also used for centuries)
 */
export type FlexDate =
  | { kind: "exact"; value: string }
  | { kind: "approx"; value: string }
  | { kind: "range"; from: string; to: string };

function validExact(v: string): boolean {
  if (!PARTIAL_DATE_RE.test(v)) return false;
  const parts = v.replace(/^-/, "").split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  return true;
}

export function parseFlexDate(v: string | null | undefined): FlexDate | null {
  if (!v) return null;
  if (v.endsWith("~")) {
    const value = v.slice(0, -1);
    return validExact(value) ? { kind: "approx", value } : null;
  }
  const slash = v.indexOf("/", 1);
  if (slash > 0) {
    const from = v.slice(0, slash);
    const to = v.slice(slash + 1);
    if (!validExact(from) || !validExact(to)) return null;
    return dateBounds(from)[0] <= dateBounds(to)[1] ? { kind: "range", from, to } : null;
  }
  return validExact(v) ? { kind: "exact", value: v } : null;
}

export function isValidPartialDate(v: string): boolean {
  return parseFlexDate(v) !== null;
}

/** Earliest / latest year a flexible date may mean (for sorting and checks). */
export function dateBounds(v: string): [number, number] {
  const f =
    parseFlexDate(v) ?? (PARTIAL_DATE_RE.test(v) ? { kind: "exact" as const, value: v } : null);
  if (!f) return [Number.NaN, Number.NaN];
  const year = (x: string) =>
    x.startsWith("-") ? -Number(x.slice(1).split("-")[0]) : Number(x.split("-")[0]);
  if (f.kind === "range") return [year(f.from), year(f.to)];
  return [year(f.value), year(f.value)];
}

const ROMAN = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
  "XVI",
  "XVII",
  "XVIII",
  "XIX",
  "XX",
  "XXI",
];

/** "1101/1200" or "1100/1199" → 12 (a whole century), else null. */
export function centuryOf(f: FlexDate): number | null {
  if (f.kind !== "range" || f.from.includes("-") || f.to.includes("-")) return null;
  const a = Number(f.from);
  const b = Number(f.to);
  if (a % 100 === 1 && b === a + 99) return (a - 1) / 100 + 1;
  if (a % 100 === 0 && b === a + 99) return a / 100 + 1;
  return null;
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

export function formatPartialDate(v: string | null | undefined, locale: Locale): string {
  const f = parseFlexDate(v);
  if (!f) return v ?? "";
  if (f.kind === "approx")
    return `${locale === "uz" ? "taxm." : locale === "ru" ? "ок." : "c."} ${formatExact(f.value, locale)}`;
  if (f.kind === "range") {
    const c = centuryOf(f);
    if (c && c < ROMAN.length)
      return locale === "uz"
        ? `${ROMAN[c]} asr`
        : locale === "ru"
          ? `${ROMAN[c]} век`
          : `${ordinal(c)} century`;
    return `${formatExact(f.from, locale)}–${formatExact(f.to, locale)}`;
  }
  return formatExact(f.value, locale);
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatExact(v: string, locale: Locale): string {
  if (v.startsWith("-")) {
    const y = v.slice(1).split("-")[0];
    return locale === "uz" ? `mil. avv. ${y}` : locale === "ru" ? `${y} до н. э.` : `${y} BC`;
  }
  const parts = v.split("-");
  const [y, m, d] = parts.map(Number);
  const loc = intlTag(locale);
  if (parts.length === 1) return String(y);
  if (parts.length === 2)
    return new Intl.DateTimeFormat(loc, { year: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    );
  return new Intl.DateTimeFormat(loc, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Compact year label for lists: "1499", "~1150", "1100–1200", "XII". */
export function shortYear(v: string | null | undefined): string {
  const f = parseFlexDate(v);
  if (!f) return v?.slice(0, 4) ?? "";
  const y = (x: string) => (x.startsWith("-") ? `-${x.slice(1).split("-")[0]}` : x.split("-")[0]);
  if (f.kind === "approx") return `~${y(f.value)}`;
  if (f.kind === "range") {
    const c = centuryOf(f);
    return c && c < ROMAN.length ? `${ROMAN[c]} asr` : `${y(f.from)}–${y(f.to)}`;
  }
  return y(f.value);
}

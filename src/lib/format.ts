import { formatDuration } from "./durations";

export type Loc = "uz" | "en";
const intlLocale = (l: Loc) => (l === "uz" ? "uz-Latn-UZ" : "en-GB");

export function fmtDate(
  d: Date | string | null | undefined,
  locale: Loc,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  if (!d) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone }).format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined, locale: Loc, timeZone: string) {
  return fmtDate(d, locale, timeZone, { dateStyle: "medium", timeStyle: "short" });
}

/** Formats a calendar day key (YYYY-MM-DD) without time-zone shifting. */
export function fmtDay(
  key: string,
  locale: Loc,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d || 1)),
  );
}

export function fmtMinutes(seconds: number, locale: Loc) {
  return formatDuration(seconds, locale);
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

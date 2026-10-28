import { formatDuration } from "./durations";
import { readingFormat } from "./reading-date";
import { type Locale } from "@/i18n/config";
import { intlTag } from "@/i18n/config";
import { toNewUz } from "./uz-latin";

export type Loc = Locale;
const intlLocale = (l: Loc) => intlTag(l);
/** Intl's Uzbek names (weekdays) are in the old spelling: shown in the 2026 alphabet. */
const post = (l: Loc, s: string) => (l === "uz" ? toNewUz(s) : s);

export function fmtDate(
  d: Date | string | null | undefined,
  locale: Loc,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  if (!d) return "";
  return post(
    locale,
    new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone }).format(new Date(d)),
  );
}

/** Start / finish date at the precision the user entered (see lib/reading-date). */
export function fmtReading(
  d: Date | string | null | undefined,
  precision: string | null | undefined,
  locale: Loc,
  timeZone: string,
) {
  if (!d) return "";
  return post(
    locale,
    new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone,
      ...readingFormat(precision ?? null),
    }).format(new Date(d)),
  );
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
  return post(
    locale,
    new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, d || 1)),
    ),
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

/**
 * Start / finish dates of a learning record with the precision the user knows:
 * just the year, the month, the day, or the exact moment.
 *
 * Wire format (forms, AI): "2024", "2024-05", "2024-05-12" or a full ISO
 * date-time. Partial dates are stored as noon UTC of their first day, so the
 * calendar day is the same in every time zone between UTC−11 and UTC+11.
 */
export const READING_PRECISIONS = ["year", "month", "day", "time"] as const;
export type ReadingPrecision = (typeof READING_PRECISIONS)[number];
export type ReadingDate = { at: Date; precision: ReadingPrecision };

const PARTIAL = /^(\d{4})(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)?$/;

export function parseReadingDate(v: string | Date | null | undefined): ReadingDate | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : { at: v, precision: "time" };
  const s = v.trim();
  const m = PARTIAL.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), m[2] ? Number(m[2]) : 1, m[3] ? Number(m[3]) : 1];
    if (y < 1000 || y > 2999) return null;
    const at = new Date(Date.UTC(y, mo - 1, d, 12));
    if (at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null;
    return { at, precision: m[3] ? "day" : m[2] ? "month" : "year" };
  }
  const at = new Date(s);
  return Number.isNaN(at.getTime()) ? null : { at, precision: "time" };
}

/** Wire value of a stored date ("2024-05" for month precision, ISO for time). */
export function readingValue(at: Date | null, precision: string | null): string {
  if (!at) return "";
  const iso = at.toISOString();
  if (precision === "year") return iso.slice(0, 4);
  if (precision === "month") return iso.slice(0, 7);
  if (precision === "day") return iso.slice(0, 10);
  return iso;
}

/** First instant after the period the date stands for (for order checks). */
export function readingEnd(d: ReadingDate): Date {
  const x = new Date(d.at);
  if (d.precision === "year") x.setUTCFullYear(x.getUTCFullYear() + 1, 0, 1);
  else if (d.precision === "month") x.setUTCMonth(x.getUTCMonth() + 1, 1);
  else if (d.precision === "day") x.setUTCDate(x.getUTCDate() + 1);
  else return x;
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Can "started" come before "completed"? Partial periods may overlap. */
export function readingOrderOk(started: ReadingDate | null, completed: ReadingDate | null) {
  if (!started || !completed) return true;
  const a = started.at;
  const startOf =
    started.precision === "time"
      ? a
      : new Date(
          Date.UTC(
            a.getUTCFullYear(),
            started.precision === "year" ? 0 : a.getUTCMonth(),
            started.precision === "day" ? a.getUTCDate() : 1,
          ),
        );
  return startOf < readingEnd(completed);
}

/** Intl options that show exactly the known precision. */
export function readingFormat(precision: string | null): Intl.DateTimeFormatOptions {
  if (precision === "year") return { year: "numeric", timeZone: "UTC" };
  if (precision === "month") return { year: "numeric", month: "long", timeZone: "UTC" };
  if (precision === "day") return { dateStyle: "medium", timeZone: "UTC" };
  return { dateStyle: "medium", timeStyle: "short" };
}

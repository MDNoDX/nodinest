import type { Locale } from "@/i18n/config";

/** Human-readable durations (used for video/lecture lengths). */
export function formatDuration(totalSeconds: number, locale: Locale): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const [hu, mu, su] =
    locale === "uz"
      ? ["soat", "daq", "son"]
      : locale === "ru"
        ? ["ч", "мин", "с"]
        : ["h", "min", "s"];
  if (h > 0) return m > 0 ? `${h} ${hu} ${m} ${mu}` : `${h} ${hu}`;
  // Seconds matter for short videos (1 daq 52 son), not for hours.
  if (sec > 0) return m > 0 ? `${m} ${mu} ${sec} ${su}` : `${sec} ${su}`;
  return `${m} ${mu}`;
}

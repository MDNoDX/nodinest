/** Human-readable durations (used for video/lecture lengths). */
export function formatDuration(totalSeconds: number, locale: "uz" | "en"): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const hu = locale === "uz" ? "soat" : "h";
  const mu = locale === "uz" ? "daq" : "min";
  if (h > 0) return m > 0 ? `${h} ${hu} ${m} ${mu}` : `${h} ${hu}`;
  return `${m} ${mu}`;
}

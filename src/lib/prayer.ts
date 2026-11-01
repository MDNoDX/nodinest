/**
 * Prayer times for a place and day (computed, no network, the place stays on
 * our side). Angles close to the Uzbekistan timetable; Hanafi asr. A table can
 * differ by a few minutes, so every time can be changed by hand.
 */
import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type Prayer = (typeof PRAYERS)[number];

/** Tashkent, until the user shares a place. */
export const DEFAULT_PLACE = { lat: 41.3111, lng: 69.2797 };

export function prayerTimes(
  day: string,
  place: { lat: number | null; lng: number | null },
  timeZone: string,
): Record<Prayer, string> {
  const [y, m, d] = day.split("-").map(Number);
  const params = CalculationMethod.Other();
  params.fajrAngle = 15;
  params.ishaAngle = 15;
  params.madhab = Madhab.Hanafi;
  const p = new PrayerTimes(
    new Coordinates(place.lat ?? DEFAULT_PLACE.lat, place.lng ?? DEFAULT_PLACE.lng),
    new Date(y, m - 1, d, 12),
    params,
  );
  const fmt = (t: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(t);
  return {
    fajr: fmt(p.fajr),
    dhuhr: fmt(p.dhuhr),
    asr: fmt(p.asr),
    maghrib: fmt(p.maghrib),
    isha: fmt(p.isha),
  };
}

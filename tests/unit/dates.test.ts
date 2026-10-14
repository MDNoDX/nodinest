import { describe, expect, it } from "vitest";
import {
  addDays,
  dateBounds,
  formatPartialDate,
  shortYear,
  dayKey,
  isValidPartialDate,
  isValidTimeZone,
  isoWeekday,
  startOfWeekKey,
} from "@/lib/dates";
import { periodRange } from "@/server/goals";

describe("dates", () => {
  it("validates partial dates without inventing precision", () => {
    for (const ok of ["1441", "1441-02", "1441-02-09", "2024-02-29", "-500"])
      expect(isValidPartialDate(ok), ok).toBe(true);
    for (const bad of ["2023-02-29", "1441-13", "14-2-9", "abc", "2020-00"])
      expect(isValidPartialDate(bad), bad).toBe(false);
  });
  it("computes calendar days in a time zone", () => {
    const instant = new Date("2026-01-01T20:30:00Z");
    expect(dayKey(instant, "UTC")).toBe("2026-01-01");
    expect(dayKey(instant, "Asia/Tashkent")).toBe("2026-01-02"); // UTC+5
    expect(dayKey(instant, "America/New_York")).toBe("2026-01-01");
  });
  it("does calendar arithmetic across DST and month ends", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoWeekday("2026-10-11")).toBe(7);
    expect(startOfWeekKey("2026-10-11")).toBe("2026-10-05");
  });
  it("checks IANA zones", () => {
    expect(isValidTimeZone("Asia/Tashkent")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
  it("goal periods", () => {
    expect(periodRange("week", "2026-10-11")).toEqual(["2026-10-05", "2026-10-11"]);
    expect(periodRange("month", "2026-02-10")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(periodRange("month", "2026-12-10")).toEqual(["2026-12-01", "2026-12-31"]);
    expect(periodRange("year", "2026-05-05")).toEqual(["2026-01-01", "2026-12-31"]);
  });
});

describe("flexible historical dates", () => {
  it("accepts exact, approximate, ranges and centuries", () => {
    for (const ok of ["1150~", "1100/1200", "1101/1200", "-500~", "-500/-400", "1441-02/1441-03"])
      expect(isValidPartialDate(ok), ok).toBe(true);
    for (const bad of ["1200/1100", "~1150", "1150~~", "1100/", "/1200", "1100/12x", "2023-02-29~"])
      expect(isValidPartialDate(bad), bad).toBe(false);
  });
  it("formats them the way people say them", () => {
    expect(formatPartialDate("1150~", "uz")).toBe("taxm. 1150");
    expect(formatPartialDate("1150~", "en")).toBe("c. 1150");
    expect(formatPartialDate("1100/1250", "uz")).toBe("1100–1250");
    expect(formatPartialDate("1101/1200", "uz")).toBe("XII asr");
    expect(formatPartialDate("1100/1199", "en")).toBe("12th century");
    expect(formatPartialDate("-500", "uz")).toBe("mil. avv. 500");
    expect(shortYear("1101/1200")).toBe("XII asr");
    expect(shortYear("1058~")).toBe("~1058");
  });
  it("bounds allow sound comparisons (birth before death)", () => {
    expect(dateBounds("1100/1200")).toEqual([1100, 1200]);
    expect(dateBounds("-500")).toEqual([-500, -500]);
    expect(dateBounds("1058~")).toEqual([1058, 1058]);
  });
});

import { describe, expect, it } from "vitest";
import {
  addDays,
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

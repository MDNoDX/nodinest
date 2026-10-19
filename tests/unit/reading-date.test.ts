import { describe, expect, it } from "vitest";
import { parseReadingDate, readingOrderOk, readingValue } from "@/lib/reading-date";

describe("reading dates", () => {
  it("keeps the precision the user typed", () => {
    expect(parseReadingDate("2024")?.precision).toBe("year");
    expect(parseReadingDate("2024-05")?.precision).toBe("month");
    expect(parseReadingDate("2024-05-12")?.precision).toBe("day");
    expect(parseReadingDate("2024-05-12T21:30:00.000Z")?.precision).toBe("time");
    expect(parseReadingDate("2024-02-30")).toBeNull();
    expect(parseReadingDate("abc")).toBeNull();
  });
  it("round-trips through the wire value", () => {
    for (const v of ["2024", "2024-05", "2024-05-12"]) {
      const d = parseReadingDate(v)!;
      expect(readingValue(d.at, d.precision)).toBe(v);
    }
  });
  it("lets partial periods overlap but rejects a finish before the start", () => {
    const p = (v: string) => parseReadingDate(v);
    expect(readingOrderOk(p("2024-05"), p("2024"))).toBe(true);
    expect(readingOrderOk(p("2024-05-12"), p("2024-05"))).toBe(true);
    expect(readingOrderOk(p("2025"), p("2024-12-31"))).toBe(false);
    expect(readingOrderOk(p("2024-06-01"), p("2024-05"))).toBe(false);
  });
});

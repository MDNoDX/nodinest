import { describe, expect, it } from "vitest";
import { timeRange } from "@/lib/time-format";

describe("a plan item's time label", () => {
  it("shows the start, the end, both, or nothing", () => {
    expect(timeRange("06:20", "07:00", false)).toBe("06:20 – 07:00");
    expect(timeRange("06:20", null, false)).toBe("06:20 –");
    expect(timeRange(null, "07:00", false)).toBe("– 07:00");
    expect(timeRange(null, null, false)).toBeNull();
    expect(timeRange("18:30", "19:15", true)).toBe("6:30 PM – 7:15 PM");
  });
});

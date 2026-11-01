import { describe, expect, it } from "vitest";
import { awakeMinutes, productivePercent } from "@/lib/roznoma";

describe("productive time", () => {
  it("counts only the hours between getting up and going to bed", () => {
    expect(awakeMinutes("06:00", "22:00")).toBe(16 * 60);
    expect(awakeMinutes("07:30", "01:00")).toBe(17.5 * 60);
    expect(awakeMinutes(null, "22:00")).toBeNull();
  });
  it("is a share of the waking day, not of 24 hours", () => {
    expect(productivePercent(8 * 60, 16 * 60)).toBe(50);
    expect(productivePercent(8 * 60, 10 * 60)).toBe(80);
    expect(productivePercent(20 * 60, 10 * 60)).toBe(100);
    expect(productivePercent(null, 10 * 60)).toBe(0);
  });
});

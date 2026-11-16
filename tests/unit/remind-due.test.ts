import { describe, expect, it } from "vitest";
import { dueNow, localMinute } from "@/lib/remind-due";

/** 2026-11-14 at hh:mm in Tashkent (UTC+5). */
const at = (hm: string) => new Date(`2026-11-14T${hm}:00+05:00`);
const plans = [{ tz: "Asia/Tashkent", at: ["07:00", "21:30", "09:15"] }];

describe("dueNow", () => {
  it("is true for three minutes after a moment, false otherwise", () => {
    expect(dueNow(plans, at("06:59"))).toBe(false);
    expect(dueNow(plans, at("07:00"))).toBe(true);
    expect(dueNow(plans, at("07:02"))).toBe(true);
    expect(dueNow(plans, at("07:03"))).toBe(false);
    expect(dueNow(plans, at("09:16"))).toBe(true);
    expect(dueNow(plans, at("12:00"))).toBe(false);
  });

  it("uses each person's own time zone and wraps at midnight", () => {
    const ny = [{ tz: "America/New_York", at: ["23:59"] }];
    expect(dueNow(ny, new Date("2026-11-15T05:00:00Z"))).toBe(true); // 00:00 there
    expect(localMinute(new Date("2026-11-14T00:30:00Z"), "UTC")).toBe(30);
  });

  it("ignores broken times and an unknown zone does not throw", () => {
    expect(
      dueNow([{ tz: "Nowhere/City", at: ["7am", "00:01"] }], new Date("2026-11-14T00:02:00Z")),
    ).toBe(true);
    expect(dueNow([], at("07:00"))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { intervalLabel, schedule } from "@/lib/srs";

const fresh = { ease: 2.5, intervalDays: 0, reps: 0 };

describe("spaced repetition", () => {
  it("grows intervals for good answers and resets on 'again'", () => {
    const a = schedule(fresh, 3);
    expect(a.intervalDays).toBe(1);
    const b = schedule({ ...fresh, ...a }, 3);
    expect(b.intervalDays).toBe(3);
    const c = schedule({ ...fresh, ...b }, 3);
    expect(c.intervalDays).toBeCloseTo(7.5);
    const again = schedule({ ...fresh, ...c }, 1);
    expect(again).toMatchObject({ reps: 0, lapse: true });
    expect(again.intervalDays).toBeLessThan(0.01);
    expect(again.ease).toBeCloseTo(2.3);
  });
  it("keeps ease within bounds and easy beats good", () => {
    let s = { ...fresh };
    for (let i = 0; i < 20; i++) s = { ...s, ...schedule(s, 2) };
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
    expect(schedule(fresh, 4).intervalDays).toBeGreaterThan(schedule(fresh, 3).intervalDays);
  });
  it("labels intervals", () => {
    expect(intervalLabel(10 / 1440, "uz")).toBe("10 daq");
    expect(intervalLabel(3, "uz")).toBe("3 kun");
    expect(intervalLabel(60, "en")).toBe("2 mo");
  });
});

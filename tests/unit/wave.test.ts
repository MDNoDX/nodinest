import { describe, expect, it } from "vitest";
import { BARS, waveOfLevels } from "@/components/chat/wave";

describe("waveOfLevels", () => {
  it("makes BARS bars from any number of levels, the loudest = 1", () => {
    const levels = Array.from({ length: 73 }, (_, i) => (i % 10) / 20);
    const w = waveOfLevels(levels);
    expect(w).toHaveLength(BARS);
    expect(Math.max(...w)).toBe(1);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(0.06);
  });

  it("works with fewer levels than bars (a short recording)", () => {
    const w = waveOfLevels([0.1, 0.5, 0.2, 0.4, 0.3, 0.2, 0.1, 0.5]);
    expect(w).toHaveLength(BARS);
    expect(w.every((v) => v > 0 && v <= 1)).toBe(true);
  });

  it("never divides by a silent recording", () => {
    expect(waveOfLevels(Array(20).fill(0)).every((v) => v === 0.06)).toBe(true);
  });
});

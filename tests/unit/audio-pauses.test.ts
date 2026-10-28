import { describe, expect, it } from "vitest";
import { stretchPauses } from "@/lib/audio-pauses";

const rate = 24000;
const tone = (ms: number) =>
  Int16Array.from({ length: (rate * ms) / 1000 }, (_, i) => Math.round(8000 * Math.sin(i / 3)));
const silence = (ms: number) => new Int16Array((rate * ms) / 1000);
const join = (...parts: Int16Array[]) => {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const quietMs = (pcm: Int16Array) => {
  // longest inner run of zeros, in ms
  let best = 0;
  let cur = 0;
  for (const v of pcm) {
    cur = v === 0 ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return (best / rate) * 1000;
};

describe("stretchPauses", () => {
  it("lengthens a sentence pause clearly and a comma pause a little", () => {
    const sentence = stretchPauses(join(tone(600), silence(300), tone(600)), rate);
    expect(quietMs(sentence)).toBeGreaterThan(600);
    const comma = stretchPauses(join(tone(600), silence(150), tone(600)), rate);
    expect(quietMs(comma)).toBeGreaterThan(200);
    expect(quietMs(comma)).toBeLessThan(330);
  });
  it("keeps the voice untouched and leaves edges and tiny gaps alone", () => {
    const pcm = join(silence(200), tone(500), silence(50), tone(500), silence(200));
    const out = stretchPauses(pcm, rate);
    expect(out.length).toBe(pcm.length);
    const words = join(tone(400), silence(300), tone(400));
    const longer = stretchPauses(words, rate);
    expect(Array.from(longer.subarray(0, 100))).toEqual(Array.from(words.subarray(0, 100)));
    expect(Array.from(longer.subarray(-100))).toEqual(Array.from(words.subarray(-100)));
  });
});

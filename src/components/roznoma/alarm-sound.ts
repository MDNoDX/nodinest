"use client";
/** Short alarm sounds made with Web Audio (no files); or the user's own file. */
let ctx: AudioContext | null = null;
export function audioCtx() {
  ctx ??= new AudioContext();
  void ctx.resume();
  return ctx;
}

type Note = [freq: number, at: number, len: number];
const PATTERNS: Record<string, { type: OscillatorType; notes: Note[]; every: number }> = {
  chime: {
    type: "sine",
    notes: [
      [659, 0, 0.9],
      [784, 0.22, 0.9],
      [988, 0.44, 1.1],
    ],
    every: 1.6,
  },
  bell: {
    type: "triangle",
    notes: [
      [880, 0, 1.4],
      [1320, 0, 0.8],
    ],
    every: 1.5,
  },
  soft: {
    type: "sine",
    notes: [
      [440, 0, 1.2],
      [554, 0.5, 1.2],
    ],
    every: 2,
  },
  rise: {
    type: "sine",
    notes: [
      [523, 0, 0.3],
      [659, 0.15, 0.3],
      [784, 0.3, 0.3],
      [1047, 0.45, 0.6],
    ],
    every: 1.4,
  },
  ping: {
    type: "square",
    notes: [
      [1200, 0, 0.12],
      [1200, 0.2, 0.12],
    ],
    every: 1,
  },
};

/** Plays a sound `times` times; `file:<id>` plays the user's upload. */
export function playAlarm(sound: string | null | undefined, times = 4) {
  try {
    if (sound?.startsWith("file:")) {
      void new Audio(`/api/files/${sound.slice(5)}`).play().catch(() => {});
      return;
    }
    const c = audioCtx();
    const p = PATTERNS[sound ?? "chime"] ?? PATTERNS.chime;
    const now = c.currentTime;
    for (let rep = 0; rep < times; rep++)
      for (const [f, at, len] of p.notes) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = p.type;
        o.frequency.value = f;
        const t0 = now + rep * p.every + at;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(p.type === "square" ? 0.08 : 0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
        o.connect(g).connect(c.destination);
        o.start(t0);
        o.stop(t0 + len + 0.05);
      }
  } catch {
    /* no audio */
  }
}

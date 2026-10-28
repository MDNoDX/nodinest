/**
 * Speech models read fast and with short pauses. A human narrator breathes:
 * a sentence end gets a clear pause, a comma a small one. This finds the
 * pauses the model already made (quiet stretches in the 16-bit PCM) and
 * lengthens them — no extra AI request, nothing re-spoken. Pure; tested.
 */
export function stretchPauses(
  pcm: Int16Array,
  rate: number,
  opts: { sentenceMs?: number; phraseMs?: number } = {},
): Int16Array {
  return stretchPausesMapped(pcm, rate, opts).pcm;
}

export type Insert = { at: number; n: number };

/** Sample index in the original → index in the stretched audio. */
export function mapIndex(inserts: Insert[], idx: number) {
  let add = 0;
  for (const x of inserts) {
    if (x.at > idx) break;
    add += x.n;
  }
  return idx + add;
}

/** Middles of the quiet stretches (≥ 110 ms) inside the clip, in samples. */
export function quietMiddles(pcm: Int16Array, rate: number): number[] {
  const frame = Math.max(1, Math.round(rate / 100));
  const { rms, quiet } = levels(pcm, frame);
  const out: number[] = [];
  let f = 0;
  while (f < rms.length) {
    if (rms[f] >= quiet) {
      f++;
      continue;
    }
    const start = f;
    while (f < rms.length && rms[f] < quiet) f++;
    if (start > 0 && f < rms.length && (f - start) * 10 >= 110)
      out.push(Math.floor((start + f) / 2) * frame);
  }
  return out;
}

function levels(pcm: Int16Array, frame: number) {
  const frames = Math.floor(pcm.length / frame);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += pcm[i] * pcm[i];
    rms[f] = Math.sqrt(sum / frame);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 1;
  return { rms, quiet: Math.max(150, loud * 0.06) };
}

/** stretchPauses that also tells where silence was added (for line timings). */
export function stretchPausesMapped(
  pcm: Int16Array,
  rate: number,
  opts: { sentenceMs?: number; phraseMs?: number } = {},
): { pcm: Int16Array; inserts: Insert[] } {
  const frame = Math.max(1, Math.round(rate / 100)); // 10 ms
  const frames = Math.floor(pcm.length / frame);
  if (frames < 10) return { pcm, inserts: [] };
  // Quiet = far below the loud part of this voice.
  const { rms, quiet } = levels(pcm, frame);
  const sentenceMs = opts.sentenceMs ?? 320;
  const phraseMs = opts.phraseMs ?? 120;

  // Where to insert how much silence (in samples), at the middle of each pause.
  const inserts: Insert[] = [];
  let f = 0;
  while (f < frames) {
    if (rms[f] >= quiet) {
      f++;
      continue;
    }
    const start = f;
    while (f < frames && rms[f] < quiet) f++;
    // Leading / trailing silence of the clip stays as it is.
    if (start === 0 || f === frames) continue;
    const ms = (f - start) * 10;
    const extra =
      ms >= 230 ? Math.min(sentenceMs, ms * 1.1) : ms >= 110 ? Math.min(phraseMs, ms * 0.6) : 0;
    if (extra > 0)
      inserts.push({
        at: Math.floor((start + f) / 2) * frame,
        n: Math.round((extra / 1000) * rate),
      });
  }
  if (!inserts.length) return { pcm, inserts };
  const out = new Int16Array(pcm.length + inserts.reduce((s, x) => s + x.n, 0));
  let from = 0;
  let to = 0;
  for (const x of inserts) {
    out.set(pcm.subarray(from, x.at), to);
    to += x.at - from + x.n; // zeros are already there
    from = x.at;
  }
  out.set(pcm.subarray(from), to);
  return { pcm: out, inserts };
}

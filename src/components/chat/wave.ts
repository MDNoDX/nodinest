"use client";

/** How many bars a voice message has. */
export const BARS = 40;

/**
 * The shape of a recording: the loudest moment of each of `n` equal slices,
 * 0-1 against the loudest one. Null when the browser cannot read the audio.
 */
export async function waveOf(blob: Blob, n = BARS): Promise<number[] | null> {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    void ctx.close();
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / n));
    const peaks: number[] = [];
    for (let i = 0; i < n; i++) {
      let peak = 0;
      const end = Math.min(data.length, (i + 1) * step);
      // Every 16th sample is plenty for a picture.
      for (let j = i * step; j < end; j += 16) peak = Math.max(peak, Math.abs(data[j]));
      peaks.push(peak);
    }
    const max = Math.max(...peaks, 0.01);
    return peaks.map((p) => Math.max(0.06, Math.min(1, p / max)));
  } catch {
    return null;
  }
}

/** A short list of levels (0-1) as bars that never look flat. */
export const shape = (levels: number[]) => levels.map((v) => Math.max(0.08, Math.min(1, v)));

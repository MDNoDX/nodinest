"use client";
/**
 * Voice messages are fetched whole, once, like Telegram: as soon as a voice
 * bubble comes near the screen it starts downloading (a few at a time), so a
 * tap plays at once from memory (`blob:`), with no range requests and no wait
 * for the server. My own recordings never download: the recorded file is
 * kept under the id it got when it went up.
 */
import { useSyncExternalStore } from "react";

export type VoiceState = {
  /** idle → loading → ready (or failed: the player falls back to the file's URL). */
  status: "idle" | "loading" | "ready" | "failed";
  /** 0..1 while loading, when the size is known. */
  progress: number | null;
  url: string | null;
};

const IDLE: VoiceState = { status: "idle", progress: null, url: null };
const entries = new Map<string, VoiceState>();
const sizes = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
/** Ids waiting for a free slot (the one wanted to play goes first). */
const waiting: string[] = [];
let running = 0;
const PARALLEL = 3;
/** Kept in memory up to this much; the oldest go first (never the one playing). */
const BUDGET = 40 * 1024 * 1024;
let playingUrl: string | null = null;

const set = (id: string, s: VoiceState) => {
  entries.set(id, s);
  listeners.get(id)?.forEach((l) => l());
};

export const voiceSrc = (id: string) => `/api/files/${id}`;

// A few silent samples. Played inside the tap, they let the same player start
// the real voice later, when it has come (phones refuse sound that starts
// long after a tap). A blob, since the page's CSP has no data: for media.
const SILENCE = "UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA";
let silent: string | null = null;
export function unlockPlayer(a: HTMLAudioElement) {
  if (a.getAttribute("src")) return;
  silent ??= URL.createObjectURL(
    new Blob([Uint8Array.from(atob(SILENCE), (c) => c.charCodeAt(0))], { type: "audio/wav" }),
  );
  a.src = silent;
  a.play()
    .then(() => {
      if (a.src === silent) a.pause();
    })
    .catch(() => {});
}

/** The player says which blob is sounding, so it is never let go. */
export function markPlaying(url: string | null) {
  playingUrl = url;
}

function trim() {
  let total = [...sizes.values()].reduce((a, b) => a + b, 0);
  for (const [id, n] of sizes) {
    if (total <= BUDGET) break;
    const e = entries.get(id);
    if (!e?.url || e.url === playingUrl) continue;
    URL.revokeObjectURL(e.url);
    sizes.delete(id);
    total -= n;
    set(id, IDLE);
  }
}

const local = new WeakMap<Blob, string>();
/** One `blob:` address per recording (the bubble on its way and the sent one share it). */
export function blobUrl(blob: Blob) {
  let url = local.get(blob);
  if (!url) local.set(blob, (url = URL.createObjectURL(blob)));
  return url;
}

function keep(id: string, blob: Blob) {
  const url = blobUrl(blob);
  sizes.set(id, blob.size);
  set(id, { status: "ready", progress: 1, url });
  trim();
}

async function download(id: string) {
  set(id, { status: "loading", progress: entries.get(id)?.progress ?? null, url: null });
  try {
    const res = await fetch(voiceSrc(id), { credentials: "same-origin" });
    if (!res.ok || !res.body) throw new Error(String(res.status));
    const total = Number(res.headers.get("content-length")) || 0;
    const type = res.headers.get("content-type") || "audio/mp4";
    const reader = res.body.getReader();
    const parts: BlobPart[] = [];
    let got = 0;
    let shown = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as Uint8Array<ArrayBuffer>);
      got += value.byteLength;
      // A new picture of the ring every 4 % is enough.
      if (total && got / total - shown >= 0.04) {
        shown = got / total;
        set(id, { status: "loading", progress: Math.min(0.99, shown), url: null });
      }
    }
    keep(id, new Blob(parts, { type }));
  } catch {
    set(id, { status: "failed", progress: null, url: null });
  }
}

function pump() {
  while (running < PARALLEL && waiting.length) {
    const id = waiting.shift()!;
    if (entries.get(id)?.status !== "loading") continue;
    running++;
    void download(id).finally(() => {
      running--;
      pump();
    });
  }
}

/**
 * Starts (or moves ahead) the download of one voice message.
 * `now`: it was tapped, so it skips the line.
 */
export function loadVoice(id: string, now = false) {
  const s = entries.get(id)?.status;
  if (s === "ready") return;
  if (s === "loading") {
    const i = waiting.indexOf(id);
    if (now && i > 0) {
      waiting.splice(i, 1);
      waiting.unshift(id);
    }
    return;
  }
  // "Waiting for a slot" already shows as loading: the ring turns at once.
  set(id, { status: "loading", progress: null, url: null });
  if (now) waiting.unshift(id);
  else waiting.push(id);
  pump();
}

/** My own recording, under the id it got on the server: nothing to download. */
export function seedVoice(id: string, blob: Blob) {
  if (entries.get(id)?.status === "ready") return;
  keep(id, blob);
}

function subscribe(id: string, l: () => void) {
  let s = listeners.get(id);
  if (!s) listeners.set(id, (s = new Set()));
  s.add(l);
  return () => {
    s.delete(l);
  };
}

export function useVoice(id: string | undefined): VoiceState {
  return useSyncExternalStore(
    (l) => (id ? subscribe(id, l) : () => {}),
    () => (id ? (entries.get(id) ?? IDLE) : IDLE),
    () => IDLE,
  );
}

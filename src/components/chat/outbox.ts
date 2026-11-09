"use client";
/**
 * Messages on their way, kept outside the page: leaving a chat while a video
 * goes up does not lose it. Coming back shows it with its progress (and ✕);
 * the top bar's tray shows it from any page. Only a reload stops an upload.
 */
import { useSyncExternalStore } from "react";
import { sendMessageAction } from "@/app/actions/dm";
import { compressImage } from "@/lib/compress-image";
import { uploadMedia } from "@/lib/upload-media";
import type { DmGif, DmMessage } from "@/server/dm";
import { seedVoice } from "./voice-cache";

export type Pending = {
  key: string;
  threadId: string;
  /** Who it goes to (the tray says "to Aziza"). */
  to: string;
  body?: string;
  file?: File;
  preview?: string;
  progress?: number;
  failed?: boolean;
  /** The reason it failed, when the server said one (FORBIDDEN, …). */
  code?: string;
  replyToId?: string;
  gif?: DmGif;
  wave?: number[] | null;
  seconds?: number;
  /** "As a file": the picture goes as it is, not made lighter. */
  original?: boolean;
};

let all: Pending[] = [];
const listeners = new Set<() => void>();
const sentListeners = new Set<(threadId: string, m: DmMessage) => void>();
const stoppers = new Map<string, AbortController>();
let me = "";

let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const patch = (key: string, p: Partial<Pending>) => {
  all = all.map((x) => (x.key === key ? { ...x, ...p } : x));
  emit();
};
const drop = (key: string) => {
  const p = all.find((x) => x.key === key);
  if (p?.preview) URL.revokeObjectURL(p.preview);
  all = all.filter((x) => x.key !== key);
  emit();
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const EMPTY: Pending[] = [];
const snaps = new Map<string, { v: number; list: Pending[] }>();

/** What is on its way in one conversation (or everywhere, for the tray). */
export function usePending(threadId?: string) {
  return useSyncExternalStore(
    subscribe,
    () => {
      const k = threadId ?? "*";
      const hit = snaps.get(k);
      if (hit && hit.v === version) return hit.list;
      const list = threadId ? all.filter((x) => x.threadId === threadId) : all;
      const next = list.length ? list : EMPTY;
      snaps.set(k, { v: version, list: next });
      return next;
    },
    () => EMPTY,
  );
}

/** A message reached the server (the open conversation shows it at once). */
export function onSent(cb: (threadId: string, m: DmMessage) => void) {
  sentListeners.add(cb);
  return () => {
    sentListeners.delete(cb);
  };
}

async function deliver(p: Pending) {
  patch(p.key, { failed: false, progress: 0, code: undefined });
  const stopper = new AbortController();
  stoppers.set(p.key, stopper);
  try {
    let fileId: string | undefined;
    if (p.file) {
      // Photos are made lighter first (much faster on a phone), unless sent as a file.
      const file = p.original ? p.file : await compressImage(p.file);
      const up = await uploadMedia(file, {
        userId: me,
        name: file.name,
        signal: stopper.signal,
        onProgress: (n) => patch(p.key, { progress: n }),
      });
      fileId = up.fileId;
      // My own voice is already here: the sent bubble plays it without a download.
      if (file.type.startsWith("audio/")) seedVoice(up.fileId, file);
    }
    if (stopper.signal.aborted) return;
    const r = await sendMessageAction(p.threadId, {
      body: p.body || undefined,
      fileId,
      replyToId: p.replyToId,
      gif: p.gif,
      wave: p.wave ?? undefined,
      seconds: p.seconds,
    });
    if (stopper.signal.aborted) return;
    if (!r.ok) return patch(p.key, { failed: true, code: r.code });
    drop(p.key);
    sentListeners.forEach((l) => l(p.threadId, r.data));
  } catch {
    if (!stopper.signal.aborted) patch(p.key, { failed: true });
  } finally {
    stoppers.delete(p.key);
  }
}

/** Sends one after another, so they arrive in order. */
let chain: Promise<void> = Promise.resolve();
export function queue(userId: string, items: Omit<Pending, "key">[]) {
  me = userId;
  const made = items.map((it, i) => ({ ...it, key: `${Date.now()}-${i}-${Math.random()}` }));
  all = [...all, ...made];
  emit();
  for (const it of made) chain = chain.then(() => deliver(it));
}

export const retry = (p: Pending) => {
  chain = chain.then(() => deliver(p));
};

/** ✕: stops the upload and forgets the message. */
export function cancel(key: string) {
  stoppers.get(key)?.abort();
  drop(key);
}

// A page closed while something is still going up: the browser asks first.
if (typeof window !== "undefined")
  window.addEventListener("beforeunload", (e) => {
    if (all.some((x) => !x.failed)) e.preventDefault();
  });

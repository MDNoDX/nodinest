"use client";
/**
 * Röznoma without the internet (Settings → App → "Work offline"): the pages a
 * person uses (sections, recent items with their reading and taqriz pages,
 * collections, notes) are fetched into the service worker's page cache, and
 * the whole text of the books in progress into the reader's own cache. On by
 * itself in the Mac / Windows app; a choice everywhere else (it downloads a few
 * megabytes). Refreshed every 12 hours while the app is open and online.
 */
import { isSavedOffline, saveOffline } from "@/components/reader/offline";
import type { OfflineManifest, OfflinePageRef } from "@/server/offline";

const MODE = "nn:offline-mode";
const AT = "nn:offline-at";
const LIST = "nn:offline-pages";
const EVERY = 12 * 3600_000;

export type SyncState = {
  running: boolean;
  done: number;
  total: number;
  /** Last finished sync (ms), from this device. */
  at: number | null;
  pages: number;
  books: number;
  failed: boolean;
};

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const put = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage full or blocked */
  }
};

export const isDesktopApp = () =>
  typeof navigator !== "undefined" && /NodiNestMac\/|Electron\//.test(navigator.userAgent);
export const canWorkOffline = () =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator && "caches" in window;

export function offlineOn(): boolean {
  const v = get(MODE);
  return v ? v === "on" : isDesktopApp();
}

/** The saved pages with their titles (the /offline page lists them). */
export function savedPages(): OfflinePageRef[] {
  try {
    return JSON.parse(get(LIST) ?? "[]") as OfflinePageRef[];
  } catch {
    return [];
  }
}

function readCounts(): Pick<SyncState, "at" | "pages" | "books"> {
  try {
    const j = JSON.parse(get(AT) ?? "null") as { at: number; pages: number; books: number } | null;
    return j ?? { at: null, pages: 0, books: 0 };
  } catch {
    return { at: null, pages: 0, books: 0 };
  }
}

let state: SyncState | null = null;
const listeners = new Set<() => void>();
const current = (): SyncState =>
  (state ??= { running: false, done: 0, total: 0, failed: false, ...readCounts() });
const set = (patch: Partial<SyncState>) => {
  state = { ...current(), ...patch };
  for (const l of listeners) l();
};
export const subscribeSync = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const syncState = () => current();
const SERVER: SyncState = {
  running: false,
  done: 0,
  total: 0,
  at: null,
  pages: 0,
  books: 0,
  failed: false,
};
export const serverSyncState = () => SERVER;

export function setOfflineOn(on: boolean) {
  put(MODE, on ? "on" : "off");
  for (const l of listeners) l();
  if (on) void syncOffline(true);
}

/** The worker fetches the pages two at a time and reports each one. */
function warm(worker: ServiceWorker, urls: string[], onDone: (n: number) => void) {
  return new Promise<number>((resolve) => {
    const ch = new MessageChannel();
    const stop = setTimeout(() => resolve(-1), 15 * 60_000);
    ch.port1.onmessage = (e: MessageEvent<{ done: number; saved?: number; end?: boolean }>) => {
      onDone(e.data.done);
      if (e.data.end) {
        clearTimeout(stop);
        resolve(e.data.saved ?? e.data.done);
      }
    };
    worker.postMessage({ type: "warm", urls, report: true }, [ch.port2]);
  });
}

async function activeWorker(): Promise<ServiceWorker | null> {
  if (!canWorkOffline()) return null;
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 5000)),
  ]);
  return reg?.active ?? null;
}

/** Brings this device's offline copy up to date (at most every 12 hours unless forced). */
export async function syncOffline(force = false) {
  const s = current();
  if (s.running || !navigator.onLine) return;
  if (!force && s.at && Date.now() - s.at < EVERY) return;
  const worker = await activeWorker();
  if (!worker) return;
  set({ running: true, done: 0, total: 0, failed: false });
  try {
    const r = await fetch("/api/offline", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const m = (await r.json()) as OfflineManifest;
    put(LIST, JSON.stringify(m.pages));
    set({ total: m.pages.length + m.books.length });
    const saved = await warm(
      worker,
      m.pages.map((p) => p.url),
      (n) => set({ done: n }),
    );
    let books = 0;
    for (const b of m.books) {
      try {
        if (!isSavedOffline(b.id)) await saveOffline(b.id, b.pages, () => {});
        books++;
      } catch {
        /* the next sync tries again */
      }
      set({ done: current().done + 1 });
    }
    const counts = { at: Date.now(), pages: Math.max(0, saved), books };
    put(AT, JSON.stringify(counts));
    set({ ...counts, running: false });
  } catch {
    set({ running: false, failed: true });
  }
}

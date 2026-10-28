"use client";
/**
 * Reading without the internet: the whole text of a book is kept in the
 * browser (Cache API, one entry per page) when the reader asks for it, and
 * pages are read from there when the network fails.
 */
const CACHE = "nn-books";
const SAVED_KEY = "nn:offline-books";
const pageKey = (id: string, page: number) => `/__offline/book/${id}/${page}`;

export type OfflinePage = { page: number; content: string };

export function isSavedOffline(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}

function markSaved(id: string, saved: boolean) {
  try {
    const list = new Set(JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as string[]);
    if (saved) list.add(id);
    else list.delete(id);
    localStorage.setItem(SAVED_KEY, JSON.stringify([...list]));
  } catch {
    /* ignore */
  }
}

/** Downloads every text page (15 at a time) into the browser. */
export async function saveOffline(
  id: string,
  pages: number[],
  onProgress: (pct: number) => void,
): Promise<void> {
  const cache = await caches.open(CACHE);
  const last = pages.at(-1) ?? 0;
  for (let from = pages[0] ?? 1; from <= last; from += 15) {
    const r = await fetch(`/api/book/${id}/pages?from=${from}&to=${from + 14}`);
    if (!r.ok) throw new Error("fetch");
    const j = (await r.json()) as { pages: OfflinePage[] };
    await Promise.all(
      j.pages.map((p) =>
        cache.put(
          pageKey(id, p.page),
          new Response(JSON.stringify(p), { headers: { "content-type": "application/json" } }),
        ),
      ),
    );
    onProgress(
      Math.min(
        100,
        Math.round(((from + 14 - (pages[0] ?? 1)) / Math.max(1, last - (pages[0] ?? 1))) * 100),
      ),
    );
  }
  markSaved(id, true);
}

/** Pages from the browser copy (when offline). */
export async function offlinePages(id: string, from: number, to: number): Promise<OfflinePage[]> {
  try {
    const cache = await caches.open(CACHE);
    const out: OfflinePage[] = [];
    for (let p = from; p <= to; p++) {
      const hit = await cache.match(pageKey(id, p));
      if (hit) out.push((await hit.json()) as OfflinePage);
    }
    return out;
  } catch {
    return [];
  }
}

export async function removeOffline(id: string, pages: number[]) {
  try {
    const cache = await caches.open(CACHE);
    await Promise.all(pages.map((p) => cache.delete(pageKey(id, p))));
  } catch {
    /* ignore */
  }
  markSaved(id, false);
}

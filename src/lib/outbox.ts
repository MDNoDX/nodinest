"use client";
/**
 * Work done with no network waits here, on this device, and goes to the server
 * when the connection is back: plan ticks, the day's page, the page a book was
 * read to, and new notes / quotes (from the note form and the reader). Book
 * writing has its own drafts in the editor; chat messages their own outbox.
 */
const KEY = "nn:outbox";

export type Job =
  | {
      kind: "check";
      id: string;
      day: string;
      state: { status: string | null; value: number | null; note: string | null };
    }
  | { kind: "day"; day: string; log: unknown }
  | { kind: "progress"; id: string; day: string; page: number; total: number }
  /** A new note or quote (`id` is this device's own, the server makes the real one). */
  /** A study card graded offline (SM-2 runs on the server when it arrives). */
  | { kind: "review"; id: string; day: string; grade: 1 | 2 | 3 | 4 }
  | {
      kind: "note";
      id: string;
      day: string;
      input: Record<string, unknown>;
      /** Set for a change to a note that exists (the last change wins). */
      noteId?: string | null;
    };

/** What a send did: it went, try again later, or it can never go (dropped). */
export type Sent = true | false | "drop";

const EVENT = "nn:outbox";

const read = (): Job[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Job[];
  } catch {
    return [];
  }
};
const write = (jobs: Job[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage full: the change stays on screen until the page closes */
  }
};

/** Keeps the job; a later change to the same thing replaces the earlier one. */
export function enqueue(job: Job) {
  const same = (j: Job) =>
    j.kind === job.kind && j.day === job.day && (j.kind === "day" || j.id === (job as typeof j).id);
  write([...read().filter((j) => !same(j)), job]);
}

export const waiting = () => read().length;

/** For useSyncExternalStore: the count changes in this tab and in others. */
export function onWaiting(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The browser says there is no network (a failed request says it too: see `queueOnFailure`). */
export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

let flushing: Promise<number> | null = null;

/**
 * Sends what waits, in order; stops at the first one that must wait (no
 * network, server down) so the order stays. A job the server refuses for good
 * (invalid, gone, forbidden) is dropped instead of blocking the rest forever.
 * One flush at a time. Returns how many went.
 */
export function flush(send: (job: Job) => Promise<Sent>) {
  flushing ??= (async () => {
    let done = 0;
    try {
      for (const job of read()) {
        const r = await send(job).catch(() => false as const);
        if (r === false) break;
        // Remove exactly this job (another tab or a newer change may have moved the list).
        write(read().filter((j) => JSON.stringify(j) !== JSON.stringify(job)));
        if (r === true) done++;
      }
    } finally {
      flushing = null;
    }
    return done;
  })();
  return flushing;
}

/** Keeps a new note (or a change to one) for later; returns this device's id for it. */
export function queueNote(input: Record<string, unknown>, noteId?: string | null) {
  const id = noteId ?? `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  enqueue({ kind: "note", id, day: "", input, noteId: noteId ?? null });
  return id;
}

/** Cards due for review, kept on this device so /review works offline. */
const DUE = "nn:review-due";
export function keepDueCards(cards: unknown[]) {
  try {
    localStorage.setItem(DUE, JSON.stringify(cards));
  } catch {
    /* storage full */
  }
}
export function keptDueCards<T extends { id: string; deck?: string | null }>(deck: string | null): T[] {
  try {
    const all = JSON.parse(localStorage.getItem(DUE) ?? "[]") as T[];
    // Cards already graded on this device (waiting in the outbox) are not due any more.
    const graded = new Set(read().filter((j) => j.kind === "review").map((j) => j.id));
    return all.filter((c) => !graded.has(c.id) && (!deck || c.deck === deck));
  } catch {
    return [];
  }
}

/** A server-action result code that will never succeed when sent again. */
export const permanent = (code: string) =>
  ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "CONFLICT", "DUPLICATE", "INDECENT"].includes(code);

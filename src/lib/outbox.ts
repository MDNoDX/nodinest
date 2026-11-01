"use client";
/**
 * Work done with no network waits here, on this device, and goes to the server
 * when the connection is back: plan ticks and the day's page. (Book writing has
 * its own drafts in the editor.)
 */
const KEY = "nn:outbox";

export type Job =
  | {
      kind: "check";
      id: string;
      day: string;
      state: { status: string | null; value: number | null; note: string | null };
    }
  | { kind: "day"; day: string; log: unknown };

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
  } catch {
    /* storage full: the change stays on screen until the page closes */
  }
};

/** Keeps the job; a later change to the same thing replaces the earlier one. */
export function enqueue(job: Job) {
  const same = (j: Job) =>
    j.kind === job.kind &&
    j.day === job.day &&
    (j.kind !== "check" || j.id === (job as typeof j).id);
  write([...read().filter((j) => !same(j)), job]);
}

export const waiting = () => read().length;

/** Sends what waits, in order; stops at the first failure. Returns how many went. */
export async function flush(send: (job: Job) => Promise<boolean>) {
  let done = 0;
  for (const job of read()) {
    if (!(await send(job).catch(() => false))) break;
    write(read().slice(1));
    done++;
  }
  return done;
}

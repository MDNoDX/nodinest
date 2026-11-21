"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { saveNoteAction } from "@/app/actions/personal";
import { checkRoutineAction, saveDayLogAction } from "@/app/actions/roznoma";
import { flush, permanent, waiting, type Job, type Sent } from "@/lib/outbox";

const send = async (job: Job): Promise<Sent> => {
  if (job.kind === "progress") {
    const r = await fetch(`/api/book/${job.id}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: job.page, total: job.total }),
    });
    // A book removed meanwhile is not worth keeping in the queue.
    if (r.ok) return true;
    return r.status === 404 || r.status === 400 ? "drop" : false;
  }
  const r =
    job.kind === "check"
      ? await checkRoutineAction(job.id, job.day, job.state as never)
      : job.kind === "day"
        ? await saveDayLogAction(job.day, job.log)
        : await saveNoteAction(job.input, job.noteId ?? null);
  if (r.ok) return true;
  return permanent(r.code) ? "drop" : false;
};

/**
 * Whatever was done offline goes out as soon as the network is back: on the
 * "online" event, when the app comes back to the front (phone web views often
 * miss "online"), and every 30 s while something waits.
 */
export function OutboxSync() {
  const router = useRouter();
  useEffect(() => {
    const go = () => {
      if (!navigator.onLine || !waiting()) return;
      void flush(send).then((n) => n && router.refresh());
    };
    const front = () => document.visibilityState === "visible" && go();
    go();
    const timer = window.setInterval(go, 30_000);
    window.addEventListener("online", go);
    document.addEventListener("visibilitychange", front);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", go);
      document.removeEventListener("visibilitychange", front);
    };
  }, [router]);
  return null;
}

"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { checkRoutineAction, saveDayLogAction } from "@/app/actions/roznoma";
import { flush, waiting, type Job } from "@/lib/outbox";

const send = async (job: Job) => {
  if (job.kind === "progress") {
    const r = await fetch(`/api/book/${job.id}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: job.page, total: job.total }),
    });
    // A book removed meanwhile is not worth keeping in the queue.
    return r.ok || r.status === 404 || r.status === 400;
  }
  const r =
    job.kind === "check"
      ? await checkRoutineAction(job.id, job.day, job.state as never)
      : await saveDayLogAction(job.day, job.log);
  return r.ok;
};

/** Whatever was done offline goes out as soon as the network is back. */
export function OutboxSync() {
  const router = useRouter();
  useEffect(() => {
    const go = () => {
      if (!navigator.onLine || !waiting()) return;
      void flush(send).then((n) => n && router.refresh());
    };
    go();
    window.addEventListener("online", go);
    return () => window.removeEventListener("online", go);
  }, [router]);
  return null;
}

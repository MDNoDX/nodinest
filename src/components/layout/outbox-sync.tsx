"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { checkRoutineAction, saveDayLogAction } from "@/app/actions/roznoma";
import { flush, waiting, type Job } from "@/lib/outbox";

const send = async (job: Job) => {
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

"use client";
import { Pause, Play, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  finishSessionAction,
  pauseSessionAction,
  resumeSessionAction,
} from "@/app/actions/personal";
import { elapsedActiveSeconds, formatClock, formatDuration } from "@/lib/durations";
import { cn } from "@/lib/cn";
import { useLocale } from "next-intl";

export type OpenSessionDTO = {
  id: string;
  status: "active" | "paused";
  resourceTitle: string | null;
  activeSeconds: number;
  lastResumedAt: string | null;
  serverNow: string;
};

/** Live clock using the server's clock offset so client skew doesn't matter. */
export function useSessionClock(s: OpenSessionDTO | null) {
  // `now` is kept in the SERVER's time frame so client clock skew is ignored.
  const [now, setNow] = useState(() => (s ? new Date(s.serverNow).getTime() : 0));
  useEffect(() => {
    if (!s || s.status !== "active") return;
    const offset = new Date(s.serverNow).getTime() - Date.now();
    const tick = () => setNow(Date.now() + offset);
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [s]);
  if (!s) return 0;
  return elapsedActiveSeconds(
    {
      status: s.status,
      activeSeconds: s.activeSeconds,
      lastResumedAt: s.lastResumedAt ? new Date(s.lastResumedAt) : null,
    },
    new Date(Math.max(now, s.lastResumedAt ? new Date(s.lastResumedAt).getTime() : 0)),
  );
}

export function TimerChip({ session }: { session: OpenSessionDTO | null }) {
  const t = useTranslations("journal");
  const te = useTranslations("errors");
  const locale = useLocale() as "uz" | "en";
  const router = useRouter();
  const [pending, start] = useTransition();
  const seconds = useSessionClock(session);
  if (!session) return null;
  const act = (fn: () => Promise<{ ok: boolean; code?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(te(r.code ?? "INTERNAL"));
      router.refresh();
    });
  return (
    <div className="border-border bg-surface flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-sm shadow-sm">
      <span
        className={cn(
          "size-2 rounded-full",
          session.status === "active" ? "bg-success animate-pulse" : "bg-warning",
        )}
        aria-hidden
      />
      <Link
        href="/journal"
        className="ml-1 max-w-[9rem] truncate font-medium tabular-nums"
        title={session.resourceTitle ?? undefined}
        aria-label={`${session.status === "active" ? t("active") : t("paused")}: ${formatClock(seconds)}`}
      >
        {formatClock(seconds)}
      </Link>
      {session.status === "active" ? (
        <button
          disabled={pending}
          onClick={() => act(() => pauseSessionAction(session.id))}
          className="text-muted hover:bg-surface-2 hover:text-foreground rounded-full p-1.5"
          aria-label={t("pause")}
        >
          <Pause className="size-3.5" />
        </button>
      ) : (
        <button
          disabled={pending}
          onClick={() => act(() => resumeSessionAction(session.id))}
          className="text-muted hover:bg-surface-2 hover:text-foreground rounded-full p-1.5"
          aria-label={t("resume")}
        >
          <Play className="size-3.5" />
        </button>
      )}
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await finishSessionAction(session.id, {});
            if (r.ok)
              toast.success(
                t("sessionFinished", { duration: formatDuration(r.data.activeSeconds, locale) }),
              );
            else toast.error(te(r.code));
            router.refresh();
          })
        }
        className="text-muted hover:bg-surface-2 hover:text-foreground rounded-full p-1.5"
        aria-label={t("finish")}
      >
        <Square className="size-3.5" />
      </button>
    </div>
  );
}

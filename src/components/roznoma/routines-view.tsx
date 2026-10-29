"use client";
import { AlarmClock, Plus, Repeat, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { reorderRoutinesAction, saveRoutineAction } from "@/app/actions/roznoma";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import { useDragOrder } from "@/lib/use-drag-order";
import { RoutineDialog, type RoutineValue } from "./routine-dialog";

type R = RoutineValue & { id: string };

/** All plan items (what repeats and the one-day ones ahead), with ready ideas. */
export function RoutinesView({ routines, today }: { routines: R[]; today: string }) {
  const t = useTranslations("roznoma");
  const te = useTranslations("errors");
  const router = useRouter();
  const [list, setList] = useState(routines);
  const [editing, setEditing] = useState<R | "new" | null>(null);
  const days = t("weekdaysShort").split(",");
  const ideas = t.raw("routineIdeas") as { title: string; amount: string; time: string }[];
  const {
    list: dragList,
    shown,
    dragged,
    start: dragStart,
  } = useDragOrder(
    list,
    (r) => r.id,
    (ids) => {
      setList((l) => ids.map((id) => l.find((x) => x.id === id)!));
      void reorderRoutinesAction(ids);
    },
  );
  const when = (r: R) =>
    r.repeat === "daily"
      ? t("repeat_daily")
      : r.repeat === "weekly"
        ? r.weekdays.map((d) => days[d - 1]).join(", ")
        : (r.onDay ?? "");
  const visible = shown.filter((r) => r.repeat !== "once" || (r.onDay ?? "") >= today);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setEditing("new")}>
          <Plus /> {t("newItem")}
        </Button>
      </div>
      <section className="card p-4">
        <p className="text-muted mb-2 flex items-center gap-1.5 text-xs font-medium">
          <Sparkles className="size-3.5" /> {t("ideas")}
        </p>
        <div className="flex flex-wrap gap-2">
          {ideas
            .filter((i) => !list.some((r) => r.title === i.title))
            .map((i) => (
              <button
                key={i.title}
                type="button"
                onClick={async () => {
                  const r = await saveRoutineAction({
                    title: i.title,
                    amount: i.amount,
                    time: i.time,
                    repeat: "daily",
                    alarm: true,
                  });
                  if (!r.ok) return errorToast(te, r);
                  router.refresh();
                }}
                className="border-border hover:border-primary hover:text-primary rounded-full border px-3 py-1 text-sm"
              >
                + {i.title} · {i.amount}
              </button>
            ))}
        </div>
      </section>
      {visible.length === 0 ? (
        <EmptyState title={t("noRoutines")} body={t("noRoutinesBody")} />
      ) : (
        <ol
          ref={dragList as React.RefObject<HTMLOListElement>}
          className="card divide-border divide-y"
        >
          {visible.map((r) => (
            <li
              key={r.id}
              onPointerDown={(e) => dragStart(e, list.indexOf(r))}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                dragged === r.id && "bg-surface-2 shadow-lg",
              )}
            >
              <button
                type="button"
                onClick={() => setEditing(r)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="text-muted flex items-center gap-1 text-xs">
                    {r.repeat !== "once" && <Repeat className="size-3" />} {when(r)}
                    {r.amount ? ` · ${r.amount}` : ""}
                  </span>
                </span>
                {r.time && (
                  <span className="bg-surface-2 text-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums">
                    {r.alarm && <AlarmClock className="size-3" />} {r.time}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <RoutineDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing === "new" ? null : editing}
          day={today}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

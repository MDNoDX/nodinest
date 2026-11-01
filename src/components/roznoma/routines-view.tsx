"use client";
import { AlarmClock, ArchiveRestore, Check, CheckSquare, Plus, Repeat, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteRoutinesAction, setArchivedAction } from "@/app/actions/roznoma";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";
import { PlanIcon } from "./plan-icon";
import { RoutineDialog, type RoutineValue } from "./routine-dialog";

type R = RoutineValue & { id: string; archived: boolean };

/**
 * The plans: everything the user ever planned. What is on the day and what is
 * stored; stored ones come back with their amount and time. Deleting for good
 * happens only here (choose several, confirm).
 */
export function RoutinesView({
  routines,
  today,
  userId,
}: {
  routines: R[];
  today: string;
  userId: string;
}) {
  const t = useTranslations("roznoma");
  const router = useRouter();
  const { pending, exec } = useAction();
  const [editing, setEditing] = useState<R | "new" | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const days = t("weekdaysShort").split(",");
  const when = (r: R) =>
    r.repeat === "daily"
      ? t("repeat_daily")
      : r.repeat === "weekly"
        ? r.weekdays.map((d) => days[d - 1]).join(", ")
        : (r.onDay ?? "");
  const top = routines.filter((r) => !r.parentId);
  const active = top.filter((r) => !r.archived);
  const stored = top.filter((r) => r.archived);

  const row = (r: R) => (
    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
      {selecting && (
        <button
          type="button"
          role="checkbox"
          aria-checked={chosen.includes(r.id)}
          aria-label={r.title}
          onClick={() =>
            setChosen((c) => (c.includes(r.id) ? c.filter((x) => x !== r.id) : [...c, r.id]))
          }
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-md border-2",
            chosen.includes(r.id)
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border-strong",
          )}
        >
          {chosen.includes(r.id) && <Check className="size-3" strokeWidth={3} />}
        </button>
      )}
      <button
        type="button"
        onClick={() => setEditing(r)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-xl">
          <PlanIcon name={r.icon} className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{r.title}</span>
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
      {r.archived && !selecting && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => exec(() => setArchivedAction([r.id], false, today))}
          aria-label={t("bringBack")}
          title={t("bringBack")}
        >
          <ArchiveRestore />
        </Button>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setEditing("new")}>
          <Plus /> {t("newItem")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSelecting((s) => !s);
            setChosen([]);
          }}
        >
          <CheckSquare /> {selecting ? t("cancel") : t("select")}
        </Button>
        {selecting && chosen.length > 0 && (
          <Button
            variant="ghost"
            className="text-danger"
            loading={pending}
            onClick={() => {
              if (!window.confirm(t("deleteConfirm", { n: chosen.length }))) return;
              exec(() => deleteRoutinesAction(chosen), {
                onSuccess: () => {
                  setChosen([]);
                  setSelecting(false);
                },
              });
            }}
          >
            <Trash2 /> {t("deleteN", { n: chosen.length })}
          </Button>
        )}
      </div>
      {top.length === 0 && <EmptyState title={t("noRoutines")} body={t("noRoutinesBody")} />}
      {active.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{t("onTheDay")}</h2>
          <ul className="card divide-border divide-y">{active.map(row)}</ul>
        </section>
      )}
      {stored.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">{t("storedTitle")}</h2>
          <p className="text-muted mb-2 text-xs">{t("storedHint")}</p>
          <ul className="card divide-border divide-y">{stored.map(row)}</ul>
        </section>
      )}
      {editing && (
        <RoutineDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing === "new" ? null : editing}
          day={today}
          userId={userId}
          stored={editing === "new" ? false : editing.archived}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

"use client";
import { Archive, Check, ChevronRight, Flame, Pencil, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { amountTarget, itemScore, type CheckStatus } from "@/lib/roznoma";
import { PlanIcon } from "./plan-icon";
import type { RoutineValue } from "./routine-dialog";

export type PlanState = { status: CheckStatus | null; value: number | null; note2: string | null };
export type SubRow = RoutineValue & { id: string } & PlanState;
export type PlanRow = RoutineValue & {
  id: string;
  streak: number;
  done: boolean;
  subs: SubRow[];
} & PlanState;

/** The tick: green = done, amber ring = part of it, red X = not done. */
export function Tick({
  status,
  score,
  missed,
  small,
  label,
  onClick,
}: {
  status: CheckStatus | null;
  score: number;
  /** The day is over and it stayed undone. */
  missed: boolean;
  small?: boolean;
  label: string;
  onClick: () => void;
}) {
  const done = status === "done";
  const x = status === "skipped" || missed;
  const partial = status === "partial";
  const size = small ? "size-6" : "size-8";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done ? true : partial ? "mixed" : false}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-state={done ? "done" : partial ? "partial" : x ? "x" : "empty"}
      className={cn("tick grid shrink-0 place-items-center rounded-full border-2", size)}
      style={
        partial
          ? ({ "--tick-fill": `${Math.round(score * 360)}deg` } as React.CSSProperties)
          : undefined
      }
    >
      {done && <Check className="tick-mark size-[62%]" strokeWidth={3.2} />}
      {x && <X className="tick-mark size-[58%]" strokeWidth={3} />}
    </button>
  );
}

/**
 * One line of the day: the time on the left (a dot without one), the tick on
 * the right. Tapping the line opens its inner items and "done partly" /
 * "could not do it".
 */
export function PlanItem({
  it,
  past,
  onState,
  onSubState,
  onEdit,
  onArchive,
  onAddSub,
}: {
  it: PlanRow;
  /** The day is over: what stayed undone shows as an X. */
  past: boolean;
  onState: (s: PlanState) => void;
  onSubState: (sub: SubRow, s: PlanState) => void;
  onEdit: () => void;
  onArchive: () => void;
  onAddSub: () => void;
}) {
  const t = useTranslations("roznoma");
  const [open, setOpen] = useState(false);
  const target = amountTarget(it.amount);
  const unit = it.amount?.replace(/^[\s\d.,]+/, "").trim() || "";
  const [value, setValue] = useState(it.value != null ? String(it.value) : "");
  const [why, setWhy] = useState(it.status === "skipped" ? (it.note2 ?? "") : "");
  const score = itemScore(it);
  const hasSubs = it.subs.length > 0;
  const subsDone = it.subs.filter((s) => s.status === "done").length;
  const skipped = it.status === "skipped";
  const missed = past && !it.status;

  const savePartial = (v: number) => {
    const full = target ? v >= target : v >= 100;
    onState(
      full
        ? { status: "done", value: null, note2: null }
        : { status: "partial", value: v, note2: null },
    );
    setOpen(false);
  };

  return (
    <li
      className={cn(
        "plan-row overflow-hidden rounded-2xl border transition-colors",
        it.done
          ? "border-[var(--c-emerald)]/30 bg-[var(--c-emerald)]/6"
          : it.status === "partial"
            ? "border-[var(--c-amber)]/35 bg-[var(--c-amber)]/6"
            : skipped || missed
              ? "border-border bg-surface-2/50"
              : "border-border bg-surface",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
      >
        <span className="text-muted w-11 shrink-0 text-center text-xs font-semibold tabular-nums">
          {it.time ?? <span className="bg-border-strong mx-auto block size-1.5 rounded-full" />}
        </span>
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
            it.done
              ? "bg-[var(--c-emerald)]/15 text-[var(--c-emerald)]"
              : "bg-primary-soft text-primary",
          )}
        >
          <PlanIcon name={it.icon} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[15px] font-medium transition-colors",
              (it.done || skipped || missed) && "text-muted",
            )}
          >
            {it.title}
          </div>
          <div className="text-muted flex flex-wrap items-center gap-x-2 text-xs">
            {it.status === "partial" && !hasSubs ? (
              <span className="font-medium text-[var(--c-amber)] tabular-nums">
                {target ? `${it.value} / ${target} ${unit}` : `${Math.round(score * 100)}%`}
              </span>
            ) : (
              it.amount && <span>{it.amount}</span>
            )}
            {hasSubs && (
              <span className="tabular-nums">
                {subsDone} / {it.subs.length}
              </span>
            )}
            {skipped && <span>{it.note2 || t("skipped")}</span>}
            {it.streak > 1 && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--c-amber)]">
                <Flame className="size-3" /> {it.streak}
              </span>
            )}
          </div>
        </div>
        {hasSubs && (
          <ChevronRight
            className={cn("text-muted size-4 shrink-0 transition-transform", open && "rotate-90")}
          />
        )}
        <Tick
          status={it.status}
          score={score}
          missed={missed}
          label={it.title}
          onClick={() => onState({ status: it.done ? null : "done", value: null, note2: null })}
        />
      </div>

      <div className={cn("plan-more grid", open && "plan-more-open")}>
        <div className="overflow-hidden">
          <div className="border-border flex flex-col gap-3 border-t px-3 py-3 text-sm">
            {it.note && <p className="text-muted text-xs">{it.note}</p>}
            {hasSubs && (
              <ul className="flex flex-col gap-1">
                {it.subs.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 py-0.5 pl-1">
                    <PlanIcon name={s.icon} className="text-muted size-4 shrink-0" />
                    <span
                      className={cn("min-w-0 flex-1 truncate", s.status === "done" && "text-muted")}
                    >
                      {s.title}
                      {s.amount && <span className="text-muted"> · {s.amount}</span>}
                    </span>
                    <Tick
                      small
                      status={s.status}
                      score={itemScore(s)}
                      missed={past && !s.status}
                      label={s.title}
                      onClick={() =>
                        onSubState(s, {
                          status: s.status === "done" ? null : "done",
                          value: null,
                          note2: null,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            {!hasSubs && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t("partialTitle")}</span>
                {target ? (
                  <span className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      className="h-8 w-20"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && value && savePartial(Number(value))}
                      aria-label={t("partialTitle")}
                    />
                    <span className="text-muted">
                      / {target} {unit}
                    </span>
                    <Button size="sm" disabled={!value} onClick={() => savePartial(Number(value))}>
                      {t("partialSave")}
                    </Button>
                  </span>
                ) : (
                  [25, 50, 75].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => savePartial(p)}
                      className="border-border rounded-full border px-3 py-1 tabular-nums transition hover:border-[var(--c-amber)]"
                    >
                      {p}%
                    </button>
                  ))
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                className="h-8"
                maxLength={200}
                placeholder={t("skipPh")}
                value={why}
                onChange={(e) => setWhy(e.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onState({ status: "skipped", value: null, note2: why.trim() || null });
                  setOpen(false);
                }}
              >
                <X /> {t("skipSave")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={onAddSub}>
                <Plus /> {t("addSub")}
              </Button>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                <Pencil /> {t("editItem")}
              </Button>
              <Button size="sm" variant="ghost" onClick={onArchive}>
                <Archive /> {t("offToday")}
              </Button>
              {it.status && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onState({ status: null, value: null, note2: null });
                    setValue("");
                    setWhy("");
                    setOpen(false);
                  }}
                >
                  {t("clearState")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

"use client";
import { Check, Flag, Target } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { checkRoutineAction } from "@/app/actions/roznoma";
import { ProgressBar } from "@/components/charts/hbar-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { percent } from "@/lib/roznoma";

type Item = {
  id: string;
  title: string;
  amount: string | null;
  time: string | null;
  done: boolean;
};
type Goal = { id: string; title: string; value: number; target: number };

/** Home: today's plan with ticks and the active goals (the Röznoma at a glance). */
export function TodayCard({
  day,
  items: initial,
  goals,
}: {
  day: string;
  items: Item[];
  goals: Goal[];
}) {
  const t = useTranslations("roznoma");
  const td = useTranslations("dashboard");
  const [items, setItems] = useState(initial);
  const done = items.filter((i) => i.done).length;
  const pct = percent(done, items.length);
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-[var(--c-amber)]/15 text-[var(--c-amber)]">
          <Target className="size-5" />
        </span>
        <h2 className="flex-1 text-sm font-semibold">{t("todayPlan")}</h2>
        {items.length > 0 && <span className="text-sm font-bold tabular-nums">{pct}%</span>}
      </div>
      {items.length > 0 ? (
        <>
          <ProgressBar value={done} max={items.length} label={t("todayPlan")} />
          <ul className="flex flex-col gap-1">
            {items.slice(0, 6).map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={i.done}
                  onClick={async () => {
                    setItems((l) => l.map((x) => (x.id === i.id ? { ...x, done: !i.done } : x)));
                    const r = await checkRoutineAction(i.id, day, !i.done).catch(() => null);
                    if (!r?.ok)
                      setItems((l) => l.map((x) => (x.id === i.id ? { ...x, done: i.done } : x)));
                  }}
                  className="hover:bg-surface-2 flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left text-sm"
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border-2",
                      i.done
                        ? "border-[var(--c-emerald)] bg-[var(--c-emerald)] text-white"
                        : "border-border-strong",
                    )}
                  >
                    {i.done && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span
                    className={cn("min-w-0 flex-1 truncate", i.done && "text-muted line-through")}
                  >
                    {i.title}
                    {i.amount && <span className="text-muted"> — {i.amount}</span>}
                  </span>
                  {i.time && <span className="text-muted text-xs tabular-nums">{i.time}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-muted text-sm">{t("noItems")}</p>
      )}
      {goals.length > 0 && (
        <ul className="border-border flex flex-col gap-2.5 border-t pt-3">
          {goals.slice(0, 3).map((g) => (
            <li key={g.id} className="text-sm">
              <div className="mb-1 flex items-center gap-1.5">
                <Flag className="size-3.5 text-[var(--c-amber)]" />
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                <span className="text-muted text-xs tabular-nums">
                  {g.value}/{g.target}
                </span>
              </div>
              <ProgressBar value={g.value} max={g.target} label={g.title} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/plans">{td("openRoznoma")}</Link>
        </Button>
        {goals.length === 0 && (
          <Button asChild size="sm" variant="ghost">
            <Link href="/plans?tab=goals">{td("setGoal")}</Link>
          </Button>
        )}
      </div>
    </section>
  );
}

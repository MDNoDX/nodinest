"use client";
import { Check, Flag, Plus, Sparkles, Trash2, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { addGoalStepAction, createStepGoalAction, setGoalStepAction } from "@/app/actions/roznoma";
import { saveGoalAction } from "@/app/actions/personal";
import { ProgressBar } from "@/components/charts/hbar-list";
import { GoalActions } from "@/components/plans/goal-actions";
import { GoalDialog } from "@/components/plans/goal-form";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";

export type GoalView = {
  id: string;
  title: string;
  note: string | null;
  metric: string;
  status: "active" | "achieved" | "archived";
  value: number;
  target: number;
  periodLabel: string;
  steps: { id: string; title: string; done: boolean }[];
};

/**
 * Goals: what the user wants to reach and what it consists of (steps to tick
 * off), or a number to reach (books / pages per period). Ready-made ideas to
 * start from when there are none.
 */
export function GoalsView({ goals }: { goals: GoalView[] }) {
  const t = useTranslations("roznoma");
  const router = useRouter();
  const { pending, exec } = useAction();
  const [open, setOpen] = useState(goals.length === 0);
  const [v, setV] = useState({ title: "", note: "", steps: "" });

  const ideas = t.raw("goalIdeas") as { title: string; steps: string[] }[];
  const create = (g: { title: string; note?: string; steps: string[] }) =>
    exec(() => createStepGoalAction({ title: g.title, note: g.note || null, steps: g.steps }), {
      success: t("goalCreated"),
      onSuccess: () => {
        setV({ title: "", note: "", steps: "" });
        setOpen(false);
      },
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setOpen((o) => !o)}>
          <Flag /> {t("newGoal")}
        </Button>
        <GoalDialog label={t("numberGoal")} />
      </div>

      {open && (
        <section className="card flex flex-col gap-3 p-5">
          <Input
            autoFocus
            value={v.title}
            maxLength={200}
            placeholder={t("goalTitlePh")}
            onChange={(e) => setV({ ...v, title: e.target.value })}
            className="text-base font-semibold"
          />
          <Input
            value={v.note}
            maxLength={2000}
            placeholder={t("goalWhyPh")}
            onChange={(e) => setV({ ...v, note: e.target.value })}
          />
          <Textarea
            rows={4}
            value={v.steps}
            placeholder={t("goalStepsPh")}
            onChange={(e) => setV({ ...v, steps: e.target.value })}
          />
          <Button
            className="self-start"
            loading={pending}
            disabled={!v.title.trim()}
            onClick={() =>
              create({
                title: v.title,
                note: v.note,
                steps: v.steps
                  .split("\n")
                  .map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim())
                  .filter(Boolean),
              })
            }
          >
            {t("save")}
          </Button>
          <div className="border-border mt-1 border-t pt-3">
            <p className="text-muted mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Sparkles className="size-3.5" /> {t("ideas")}
            </p>
            <div className="flex flex-wrap gap-2">
              {ideas.map((g) => (
                <button
                  key={g.title}
                  type="button"
                  onClick={() => setV({ title: g.title, note: "", steps: g.steps.join("\n") })}
                  className="border-border hover:border-primary hover:text-primary rounded-full border px-3 py-1 text-sm"
                >
                  {g.title}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  exec(
                    () =>
                      saveGoalAction({
                        title: t("ideaBooksTitle"),
                        metric: "completed_resources",
                        period: "year",
                        target: 24,
                        resourceType: "book",
                      }),
                    { success: t("goalCreated") },
                  )
                }
                className="border-border hover:border-primary hover:text-primary rounded-full border px-3 py-1 text-sm"
              >
                {t("ideaBooksTitle")}
              </button>
            </div>
          </div>
        </section>
      )}

      {goals.length === 0 ? null : (
        <ul className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} g={g} onChange={() => router.refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalCard({ g, onChange }: { g: GoalView; onChange: () => void }) {
  const t = useTranslations("roznoma");
  const [steps, setSteps] = useState(g.steps);
  const [step, setStep] = useState("");
  const done = steps.filter((s) => s.done).length;
  const value = g.metric === "steps" ? done : g.value;
  const target = g.metric === "steps" ? Math.max(1, steps.length) : g.target;
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <li
      className={cn(
        "card flex flex-col gap-3 p-5",
        g.status === "achieved" && "border-[var(--c-emerald)]/40",
        g.status === "archived" && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            g.status === "achieved"
              ? "bg-[var(--c-emerald)]/15 text-[var(--c-emerald)]"
              : "bg-[var(--c-amber)]/15 text-[var(--c-amber)]",
          )}
        >
          {g.status === "achieved" ? <Trophy className="size-5" /> : <Flag className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{g.title}</h3>
          {g.note && <p className="text-muted text-sm">{g.note}</p>}
          <p className="text-muted mt-0.5 text-xs">
            {g.metric === "steps" ? t("stepsDone", { done, total: steps.length }) : g.periodLabel}
          </p>
        </div>
        <span className="text-lg font-bold tabular-nums">{pct}%</span>
      </div>
      <ProgressBar value={value} max={target} label={g.title} />
      {(g.metric === "steps" || steps.length > 0) && (
        <ul className="flex flex-col gap-1">
          {steps.map((s) => (
            <li key={s.id} className="group flex items-center gap-2 text-sm">
              <button
                type="button"
                role="checkbox"
                aria-checked={s.done}
                aria-label={s.title}
                onClick={async () => {
                  setSteps((l) => l.map((x) => (x.id === s.id ? { ...x, done: !s.done } : x)));
                  const r = await setGoalStepAction(s.id, !s.done);
                  if (r.ok) onChange();
                }}
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-md border-2",
                  s.done
                    ? "border-[var(--c-emerald)] bg-[var(--c-emerald)] text-white"
                    : "border-border-strong",
                )}
              >
                {s.done && <Check className="size-3" strokeWidth={3} />}
              </button>
              <span className={cn("flex-1", s.done && "text-muted line-through")}>{s.title}</span>
              <button
                type="button"
                aria-label={t("delete")}
                className="text-muted hover:text-danger opacity-0 group-hover:opacity-100"
                onClick={async () => {
                  setSteps((l) => l.filter((x) => x.id !== s.id));
                  await setGoalStepAction(s.id, null);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const title = step.trim();
          if (!title) return;
          setStep("");
          const r = await addGoalStepAction(g.id, title);
          if (r.ok) setSteps((l) => [...l, { id: r.data, title, done: false }]);
        }}
      >
        <Input
          value={step}
          maxLength={200}
          placeholder={t("stepPh")}
          onChange={(e) => setStep(e.target.value)}
          className="h-9 text-sm"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!step.trim()}>
          <Plus />
        </Button>
      </form>
      <div className="flex justify-end">
        <GoalActions id={g.id} status={g.status} />
      </div>
    </li>
  );
}

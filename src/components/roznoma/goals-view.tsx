"use client";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Flag,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  addGoalStepAction,
  createGoalAction,
  resolveGoalAction,
  setGoalStepAction,
} from "@/app/actions/roznoma";
import { ProgressBar } from "@/components/charts/hbar-list";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { GOAL_ICON, GOAL_KINDS } from "@/lib/plan-icons";
import { useAction } from "@/lib/use-action";
import { PlanIcon } from "./plan-icon";

export type GoalView = {
  id: string;
  title: string;
  note: string | null;
  metric: string;
  status: "active" | "achieved" | "archived";
  missed: boolean;
  kind: string | null;
  dueOn: string | null;
  dueLabel: string | null;
  value: number;
  target: number;
  periodLabel: string;
  steps: { id: string; title: string; note: string | null; done: boolean }[];
};
type Kind = (typeof GOAL_KINDS)[number];

/** A burst of paper when a goal is reached (light, CSS only). */
function Confetti() {
  const colors = ["#f5a524", "#22c55e", "#6366f1", "#ec4899", "#06b6d4"];
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 48 }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${(i * 37) % 100}%`,
              background: colors[i % colors.length],
              animationDelay: `${(i % 12) * 0.05}s`,
              "--dx": `${((i * 53) % 120) - 60}px`,
              "--r": `${360 + ((i * 47) % 540)}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Goals: a name, a deadline, a kind, and steps that raise the percent. */
export function GoalsView({ goals, today }: { goals: GoalView[]; today: string }) {
  const t = useTranslations("roznoma");
  const { pending, exec } = useAction();
  const router = useRouter();
  const [open, setOpen] = useState(goals.length === 0);
  const [v, setV] = useState({ title: "", note: "", dueOn: "", kind: "other" as Kind });
  const [steps, setSteps] = useState<{ title: string; note: string }[]>([{ title: "", note: "" }]);
  const [party, setParty] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const raw = t.raw("goalIdeas");
  const ideas = (Array.isArray(raw) ? raw : []) as { title: string; kind: Kind; steps: string[] }[];
  const celebrate = () => {
    setParty(true);
    setTimeout(() => setParty(false), 3200);
  };
  const live = goals.filter((g) => g.status === "active");
  const archive = goals.filter((g) => g.status !== "active");
  const due = live.filter((g) => g.dueOn && g.dueOn < today);

  return (
    <div className="flex flex-col gap-5">
      {party && <Confetti />}
      {due.map((g) => (
        <section
          key={g.id}
          className="card flex flex-wrap items-center gap-3 border-[var(--c-amber)]/40 p-4"
        >
          <CalendarClock className="size-5 text-[var(--c-amber)]" />
          <p className="min-w-0 flex-1 text-sm font-medium">{t("dueAsk", { title: g.title })}</p>
          <Button
            size="sm"
            onClick={() =>
              exec(() => resolveGoalAction(g.id, true), {
                onSuccess: () => {
                  celebrate();
                  router.refresh();
                },
              })
            }
          >
            {t("dueYes")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => exec(() => resolveGoalAction(g.id, false))}
          >
            {t("dueNo")}
          </Button>
        </section>
      ))}
      <Button className="self-start" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Flag /> {t("newGoal")}
      </Button>
      {open && (
        <section className="card flex flex-col gap-4 p-5">
          <Field label={t("goalName")}>
            {(p) => (
              <Input
                {...p}
                autoFocus
                value={v.title}
                maxLength={200}
                placeholder={t("goalTitlePh")}
                onChange={(e) => setV({ ...v, title: e.target.value })}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("goalDue")} optional>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  min={today}
                  value={v.dueOn}
                  onChange={(e) => setV({ ...v, dueOn: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("goalWhy")} optional>
              {(p) => (
                <Input
                  {...p}
                  value={v.note}
                  maxLength={2000}
                  onChange={(e) => setV({ ...v, note: e.target.value })}
                />
              )}
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("goalSteps")}</span>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-muted w-5 text-right text-sm tabular-nums">{i + 1}</span>
                <Input
                  value={s.title}
                  maxLength={200}
                  placeholder={t("stepPh")}
                  onChange={(e) =>
                    setSteps((l) =>
                      l.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSteps((l) => [...l, { title: "", note: "" }])}
              className="text-primary inline-flex items-center gap-1 self-start text-sm font-medium"
            >
              <Plus className="size-4" /> {t("addStep")}
            </button>
          </div>
          <Button
            className="self-start"
            loading={pending}
            disabled={!v.title.trim()}
            onClick={() =>
              exec(
                () =>
                  createGoalAction({
                    title: v.title,
                    note: v.note || null,
                    kind: v.kind,
                    dueOn: v.dueOn || null,
                    steps: steps.filter((s) => s.title.trim()),
                  }),
                {
                  success: t("goalCreated"),
                  onSuccess: () => {
                    setV({ title: "", note: "", dueOn: "", kind: "other" });
                    setSteps([{ title: "", note: "" }]);
                    setOpen(false);
                  },
                },
              )
            }
          >
            {t("save")}
          </Button>
          <div className="border-border border-t pt-3">
            <p className="text-muted mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Sparkles className="size-3.5" /> {t("ideas")}
            </p>
            <div className="flex flex-wrap gap-2">
              {ideas.map((g) => (
                <button
                  key={g.title}
                  type="button"
                  onClick={() => {
                    setV({ ...v, title: g.title, kind: g.kind });
                    setSteps(g.steps.map((title) => ({ title, note: "" })));
                  }}
                  className="border-border hover:border-primary hover:text-primary rounded-full border px-3 py-1 text-sm transition"
                >
                  {g.title}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
      {live.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {live.map((g) => (
            <GoalCard key={g.id} g={g} onReached={celebrate} onChange={() => router.refresh()} />
          ))}
        </ul>
      )}
      {archive.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowArchive((s) => !s)}
            aria-expanded={showArchive}
            className="text-muted hover:text-foreground flex items-center gap-1 text-sm font-semibold"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", showArchive && "rotate-180")}
            />
            {t("goalArchive", { n: archive.length })}
          </button>
          {showArchive && (
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {archive.map((g) => (
                <li key={g.id} className="card flex items-center gap-3 p-4">
                  {g.status === "achieved" ? (
                    <Trophy className="size-5 text-[var(--c-emerald)]" />
                  ) : (
                    <Flag className="text-muted size-5" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g.title}</span>
                    <span className="text-muted text-xs">
                      {g.status === "achieved" ? t("reached") : t("notReached")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function GoalCard({
  g,
  onReached,
  onChange,
}: {
  g: GoalView;
  onReached: () => void;
  onChange: () => void;
}) {
  const t = useTranslations("roznoma");
  const [steps, setSteps] = useState(g.steps);
  const [step, setStep] = useState("");
  const done = steps.filter((s) => s.done).length;
  const value = g.metric === "steps" ? done : g.value;
  const target = g.metric === "steps" ? Math.max(1, steps.length) : g.target;
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--c-amber)]/15 text-[var(--c-amber)]">
          <PlanIcon name={GOAL_ICON[(g.kind ?? "other") as Kind] ?? "target"} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{g.title}</h3>
          {g.note && <p className="text-muted text-sm">{g.note}</p>}
          <p className="text-muted mt-0.5 text-xs">
            {g.dueLabel ? t("dueOn", { date: g.dueLabel }) : g.periodLabel}
          </p>
        </div>
        <span className="text-lg font-bold tabular-nums">{pct}%</span>
      </div>
      <ProgressBar value={value} max={target} label={g.title} />
      {steps.length > 0 && (
        <ul className="flex flex-col gap-1">
          {steps.map((s, i) => (
            <li key={s.id} className="group flex items-center gap-2 text-sm">
              <span className="text-muted w-4 text-right text-xs tabular-nums">{i + 1}</span>
              <span className={cn("min-w-0 flex-1", s.done && "text-muted line-through")}>
                {s.title}
              </span>
              <button
                type="button"
                aria-label={t("delete")}
                className="text-muted hover:text-danger opacity-0 transition group-hover:opacity-100"
                onClick={async () => {
                  setSteps((l) => l.filter((x) => x.id !== s.id));
                  await setGoalStepAction(s.id, null);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
              <button
                type="button"
                role="checkbox"
                aria-checked={s.done}
                aria-label={s.title}
                data-state={s.done ? "done" : "empty"}
                onClick={async () => {
                  setSteps((l) => l.map((x) => (x.id === s.id ? { ...x, done: !s.done } : x)));
                  const r = await setGoalStepAction(s.id, !s.done);
                  if (r.ok && r.data.reached) {
                    onReached();
                    setTimeout(onChange, 1500);
                  }
                }}
                className="tick grid size-6 shrink-0 place-items-center rounded-full border-2"
              >
                {s.done && <Check className="tick-mark size-3.5" strokeWidth={3.2} />}
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
          const r = await addGoalStepAction(g.id, { title });
          if (r.ok) setSteps((l) => [...l, { id: r.data, title, note: null, done: false }]);
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
    </li>
  );
}

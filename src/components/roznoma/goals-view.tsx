"use client";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Flag,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addGoalStepAction,
  createGoalAction,
  removeGoalAction,
  reopenGoalAction,
  resolveGoalAction,
  setGoalStepAction,
  updateGoalAction,
} from "@/app/actions/roznoma";
import { ProgressBar } from "@/components/charts/hbar-list";
import { ask } from "@/components/ui/ask";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import type { ActionResult } from "@/lib/errors";
import { fmtDay, type Loc } from "@/lib/format";
import { GOAL_ICON, GOAL_KINDS } from "@/lib/plan-icons";
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
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const router = useRouter();
  const [open, setOpen] = useState(goals.length === 0);
  const [editing, setEditing] = useState<GoalView | null>(null);
  const [party, setParty] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  // What is on screen: changed at once, then replaced by the server's list
  // (an action's revalidatePath brings it back in the same answer).
  const [list, setList] = useState(goals);
  const [prev, setPrev] = useState(goals);
  if (prev !== goals) {
    setPrev(goals);
    setList(goals);
  }
  const celebrate = () => {
    setParty(true);
    setTimeout(() => setParty(false), 3200);
  };
  const live = list.filter((g) => g.status === "active");
  const archive = list.filter((g) => g.status !== "active");
  const due = live.filter((g) => g.dueOn && g.dueOn < today);

  /** Shows a change now, sends it, and puts things back if it fails. */
  const optimistic = async (
    change: (l: GoalView[]) => GoalView[],
    send: () => Promise<ActionResult<unknown>>,
    success?: string,
  ) => {
    const before = list;
    setList(change);
    const r = await send().catch(() => null);
    if (!r?.ok) {
      setList(before);
      return errorToast(te, r && !r.ok ? r : "INTERNAL");
    }
    if (success) toast.success(success);
  };
  const setStatus = (id: string, status: GoalView["status"], missed: boolean) => (l: GoalView[]) =>
    l.map((x) => (x.id === id ? { ...x, status, missed } : x));

  // Deleting asks first; the goal disappears at once and comes back if it fails.
  const remove = async (g: GoalView) => {
    const yes = await ask({
      title: t("goalDeleteTitle"),
      message: t("goalDeleteBody", { title: g.title }),
      remove: true,
    });
    if (yes)
      void optimistic(
        (l) => l.filter((x) => x.id !== g.id),
        () => removeGoalAction(g.id),
        t("goalDeleted"),
      );
  };
  const saved = (g: GoalView, send: () => Promise<ActionResult<unknown>>, success: string) =>
    void optimistic(
      (l) => (l.some((x) => x.id === g.id) ? l.map((x) => (x.id === g.id ? g : x)) : [g, ...l]),
      send,
      success,
    );

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
            onClick={() => {
              celebrate();
              void optimistic(setStatus(g.id, "achieved", false), () =>
                resolveGoalAction(g.id, true),
              );
            }}
          >
            {t("dueYes")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void optimistic(setStatus(g.id, "archived", true), () =>
                resolveGoalAction(g.id, false),
              )
            }
          >
            {t("dueNo")}
          </Button>
        </section>
      ))}
      <Button className="self-start" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Flag /> {t("newGoal")}
      </Button>
      {open && (
        <section className="card animate-fade-in p-5">
          <GoalForm today={today} onDone={() => setOpen(false)} onSave={saved} />
        </section>
      )}
      {live.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {live.map((g) => (
            <GoalCard
              key={g.id}
              g={g}
              onReached={celebrate}
              onChange={() => router.refresh()}
              onEdit={() => setEditing(g)}
              onRemove={() => void remove(g)}
            />
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
                <ArchivedGoal
                  key={g.id}
                  g={g}
                  onReopen={() =>
                    void optimistic(
                      setStatus(g.id, "active", false),
                      () => reopenGoalAction(g.id),
                      t("goalReopened"),
                    )
                  }
                  onRemove={() => void remove(g)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={t("goalEdit")} closeLabel={tc("close")}>
            <GoalForm
              key={editing.id}
              today={today}
              goal={editing}
              onDone={() => setEditing(null)}
              onSave={saved}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

type StepDraft = { id?: string; title: string; done?: boolean };

/** A new goal, or one being changed: the same fields, steps can be renamed and removed. */
function GoalForm({
  today,
  goal,
  onDone,
  onSave,
}: {
  today: string;
  goal?: GoalView;
  onDone: () => void;
  /** Shows the goal at once and sends it (GoalsView `saved`). */
  onSave: (g: GoalView, send: () => Promise<ActionResult<unknown>>, success: string) => void;
}) {
  const t = useTranslations("roznoma");
  const locale = useLocale() as Loc;
  const [v, setV] = useState({
    title: goal?.title ?? "",
    note: goal?.note ?? "",
    dueOn: goal?.dueOn ?? "",
    kind: (goal?.kind ?? "other") as Kind,
  });
  const [steps, setSteps] = useState<StepDraft[]>(
    goal?.steps.length
      ? goal.steps.map((s) => ({ id: s.id, title: s.title, done: s.done }))
      : [{ title: "" }],
  );
  const raw = t.raw("goalIdeas");
  const ideas = (Array.isArray(raw) ? raw : []) as { title: string; kind: Kind; steps: string[] }[];
  const lastStep = useRef<HTMLInputElement>(null);
  // A step just added gets the cursor.
  const focusLast = useRef(false);
  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    lastStep.current?.focus();
  }, [steps.length]);

  // Saved without waiting: the card shows at once (faded until the server
  // answers), the form closes, and a failure puts things back.
  const save = () => {
    const kept = steps.filter((s) => s.title.trim());
    const input = {
      title: v.title.trim(),
      note: v.note || null,
      kind: v.kind,
      dueOn: v.dueOn || null,
      steps: kept.map((s) =>
        goal ? { id: s.id, title: s.title, done: s.done } : { title: s.title },
      ),
    };
    const id = goal?.id ?? `tmp-${Date.now()}`;
    const shown: GoalView = {
      ...(goal ?? {
        metric: "steps",
        status: "active" as const,
        missed: false,
        value: 0,
        periodLabel: "",
      }),
      id,
      title: input.title,
      note: input.note,
      kind: input.kind,
      dueOn: input.dueOn,
      dueLabel: input.dueOn
        ? fmtDay(input.dueOn, locale, { day: "numeric", month: "long", year: "numeric" })
        : null,
      target: Math.max(1, kept.length),
      steps: kept.map((s, i) => ({
        id: s.id ?? `tmp-${id}-${i}`,
        title: s.title,
        note: null,
        done: !!s.done,
      })),
    };
    onSave(
      shown,
      () => (goal ? updateGoalAction(goal.id, input) : createGoalAction(input)),
      goal ? t("goalSaved") : t("goalCreated"),
    );
    if (!goal) {
      setV({ title: "", note: "", dueOn: "", kind: "other" });
      setSteps([{ title: "" }]);
    }
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.title.trim()) save();
      }}
    >
      <Field label={t("goalName")}>
        {(p) => (
          <Input
            {...p}
            autoFocus={!goal}
            value={v.title}
            maxLength={200}
            placeholder={t("goalTitlePh")}
            onChange={(e) => setV({ ...v, title: e.target.value })}
          />
        )}
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("goalKind")}</span>
        <div className="flex flex-wrap gap-1.5">
          {GOAL_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setV({ ...v, kind: k })}
              aria-pressed={v.kind === k}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1.5 text-sm transition",
                v.kind === k
                  ? "border-primary bg-primary-soft text-foreground font-medium"
                  : "border-border text-muted hover:border-primary/50 hover:text-foreground",
              )}
            >
              <PlanIcon name={GOAL_ICON[k]} className="size-5" />
              {t(`kind_${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("goalDue")} optional>
          {(p) => (
            <DatePicker
              id={p.id}
              aria-describedby={p["aria-describedby"]}
              value={v.dueOn}
              onChange={(d) => setV({ ...v, dueOn: d })}
              min={today}
              today={today}
              presets
              showLeft
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
          <div key={s.id ?? `n${i}`} className="group flex items-center gap-2">
            <span
              className={cn(
                "w-5 shrink-0 text-right text-sm tabular-nums",
                s.done ? "text-[var(--c-emerald)]" : "text-muted",
              )}
            >
              {s.done ? <Check className="ml-auto size-4" /> : i + 1}
            </span>
            <Input
              ref={i === steps.length - 1 ? lastStep : undefined}
              value={s.title}
              maxLength={200}
              placeholder={t("stepPh")}
              onChange={(e) =>
                setSteps((l) => l.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))
              }
              onKeyDown={(e) => {
                // Enter on the last step opens the next one (like a list).
                if (e.key === "Enter" && i === steps.length - 1 && s.title.trim()) {
                  e.preventDefault();
                  setSteps((l) => [...l, { title: "" }]);
                  focusLast.current = true;
                }
              }}
            />
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => setSteps((l) => l.filter((_, k) => k !== i))}
                aria-label={t("removeStep")}
                title={t("removeStep")}
                className="text-muted hover:text-danger hover:bg-danger/10 grid size-9 shrink-0 place-items-center rounded-lg transition"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setSteps((l) => [...l, { title: "" }]);
            focusLast.current = true;
          }}
          className="text-primary inline-flex items-center gap-1 self-start text-sm font-medium"
        >
          <Plus className="size-4" /> {t("addStep")}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!v.title.trim()}>
          {t("save")}
        </Button>
        {goal && (
          <Button type="button" variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
        )}
      </div>

      {!goal && (
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
                  setSteps(g.steps.map((title) => ({ title })));
                }}
                className="border-border hover:border-primary hover:text-primary rounded-full border px-3 py-1 text-sm transition"
              >
                {g.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * Edit / delete for a card: they appear when the pointer is over it (a
 * computer), or after a tap on the card's head (a phone); a tap elsewhere
 * hides them again.
 */
function useTapToShow() {
  const ref = useRef<HTMLLIElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setShown(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [shown]);
  const toggle = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input")) return;
    if (window.matchMedia("(hover: none)").matches) setShown((s) => !s);
  };
  return { ref, shown, toggle };
}

function CardActions({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "bg-surface border-border absolute top-3 right-3 z-[1] flex items-center gap-0.5 rounded-xl border p-0.5 shadow-lg transition",
        "pointer-events-none translate-y-1 opacity-0",
        "focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100",
        "[@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100",
        shown && "pointer-events-auto translate-y-0 opacity-100",
      )}
    >
      {children}
    </div>
  );
}

function ActionButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-lg transition",
        danger
          ? "text-muted hover:bg-danger/10 hover:text-danger"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ArchivedGoal({
  g,
  onReopen,
  onRemove,
}: {
  g: GoalView;
  onReopen: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("roznoma");
  const { ref, shown, toggle } = useTapToShow();
  return (
    <li ref={ref} onClick={toggle} className="card group relative flex items-center gap-3 p-4">
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
      <CardActions shown={shown}>
        <ActionButton label={t("goalReopen")} onClick={onReopen}>
          <RotateCcw className="size-4" />
        </ActionButton>
        <ActionButton label={t("delete")} danger onClick={onRemove}>
          <Trash2 className="size-4" />
        </ActionButton>
      </CardActions>
    </li>
  );
}

function GoalCard({
  g,
  onReached,
  onChange,
  onEdit,
  onRemove,
}: {
  g: GoalView;
  onReached: () => void;
  onChange: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("roznoma");
  const [steps, setSteps] = useState(g.steps);
  const [step, setStep] = useState("");
  const { ref, shown, toggle } = useTapToShow();
  // A change saved in the edit window (or the server's answer) replaces the list.
  const [prev, setPrev] = useState(g.steps);
  if (prev !== g.steps) {
    setPrev(g.steps);
    setSteps(g.steps);
  }
  // Not saved yet: shown, but nothing on it can be pressed until it is.
  const saving = g.id.startsWith("tmp-");
  const done = steps.filter((s) => s.done).length;
  const value = g.metric === "steps" ? done : g.value;
  const target = g.metric === "steps" ? Math.max(1, steps.length) : g.target;
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <li
      ref={ref}
      aria-busy={saving}
      className={cn(
        "card group animate-fade-in relative flex flex-col gap-3 p-5 transition-opacity",
        saving && "pointer-events-none opacity-60",
      )}
    >
      <CardActions shown={shown}>
        <ActionButton label={t("goalEdit")} onClick={onEdit}>
          <Pencil className="size-4" />
        </ActionButton>
        <ActionButton label={t("delete")} danger onClick={onRemove}>
          <Trash2 className="size-4" />
        </ActionButton>
      </CardActions>
      <div className="flex items-start gap-3" onClick={toggle}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--c-amber)]/15 text-[var(--c-amber)]">
          <PlanIcon name={GOAL_ICON[(g.kind ?? "other") as Kind] ?? "target"} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold break-words">{g.title}</h3>
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
            <li key={s.id} className="group/step flex items-center gap-2 text-sm">
              <span className="text-muted w-4 text-right text-xs tabular-nums">{i + 1}</span>
              <span className={cn("min-w-0 flex-1", s.done && "text-muted line-through")}>
                {s.title}
              </span>
              <button
                type="button"
                aria-label={t("delete")}
                className="text-muted hover:text-danger opacity-0 transition group-hover/step:opacity-100 focus-visible:opacity-100"
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
          // The step shows at once; it gets its real id when the server answers.
          const tmp = `tmp-${Date.now()}`;
          setSteps((l) => [...l, { id: tmp, title, note: null, done: false }]);
          const r = await addGoalStepAction(g.id, { title }).catch(() => null);
          setSteps((l) =>
            r?.ok
              ? l.map((x) => (x.id === tmp ? { ...x, id: r.data } : x))
              : l.filter((x) => x.id !== tmp),
          );
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

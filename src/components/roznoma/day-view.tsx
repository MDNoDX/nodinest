"use client";
import {
  AlarmClock,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Moon,
  Pencil,
  Plus,
  Quote,
  Repeat,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  checkRoutineAction,
  reorderRoutinesAction,
  saveDayLogAction,
  saveRoutineAction,
} from "@/app/actions/roznoma";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import { percent, productivePercent } from "@/lib/roznoma";
import { useDragOrder } from "@/lib/use-drag-order";
import { RoutineDialog, type RoutineValue } from "./routine-dialog";

export type DayItem = RoutineValue & { id: string; done: boolean; note: string | null };
export type DayLogValue = {
  motto: string | null;
  title: string | null;
  story: string | null;
  highlights: string[];
  lesson: string | null;
  productiveMinutes: number | null;
  better: boolean | null;
};

/** A ring that fills with the share of the day's plan that is done. */
function Ring({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-20 shrink-0 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={pct >= 100 ? "var(--c-emerald)" : "var(--primary)"}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * pct) / 100}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

/**
 * One day of the Röznoma: the date (and Hijri date), the motto, the plan with
 * ticks (hold and drag to reorder), a quick "one thing for today", and the
 * day's page — title, story, what to remember, lesson, productive time and
 * "better than yesterday?". Saving writes the day into the year's book too.
 */
export function DayView({
  day,
  isToday,
  dateLabel,
  hijri,
  prevHref,
  nextHref,
  initialItems,
  log: initialLog,
  motto: initialMotto,
}: {
  day: string;
  isToday: boolean;
  dateLabel: string;
  hijri: string;
  prevHref: string;
  nextHref: string;
  initialItems: DayItem[];
  log: DayLogValue;
  motto: string | null;
}) {
  const t = useTranslations("roznoma");
  const te = useTranslations("errors");
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [log, setLog] = useState<DayLogValue>({ ...initialLog, motto: initialMotto });
  const [editing, setEditing] = useState<DayItem | "new" | null>(null);
  const [quick, setQuick] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [mottoEdit, setMottoEdit] = useState(false);
  const [highlight, setHighlight] = useState("");
  const [notif, setNotif] = useState<NotificationPermission | "none">("none");
  useEffect(() => {
    queueMicrotask(() => setNotif("Notification" in window ? Notification.permission : "none"));
  }, []);

  const done = items.filter((i) => i.done).length;
  const pct = percent(done, items.length);

  const tick = async (it: DayItem, on: boolean, note?: string) => {
    setItems((l) => l.map((x) => (x.id === it.id ? { ...x, done: on, note: note ?? x.note } : x)));
    if (on && items.filter((x) => x.done).length + 1 === items.length) toast.success(t("allDone"));
    const r = await checkRoutineAction(it.id, day, on, note ?? it.note ?? undefined).catch(
      () => null,
    );
    if (!r?.ok) {
      setItems((l) => l.map((x) => (x.id === it.id ? { ...x, done: !on } : x)));
      errorToast(te, r && !r.ok ? r : "INTERNAL");
    }
  };

  const {
    list: dragList,
    shown,
    dragged,
    start: dragStart,
  } = useDragOrder(
    items,
    (i) => i.id,
    (ids) => {
      setItems((l) => ids.map((id) => l.find((x) => x.id === id)!));
      void reorderRoutinesAction(ids);
    },
  );

  const addQuick = async () => {
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    const r = await saveRoutineAction({
      title,
      repeat: "once",
      onDay: day,
      alarm: false,
    });
    if (!r.ok) return errorToast(te, r);
    router.refresh();
  };

  // The server's list after an add / edit.
  useEffect(() => {
    queueMicrotask(() => setItems(initialItems));
  }, [initialItems]);

  const saveLog = async (next = log) => {
    setSavingLog(true);
    const r = await saveDayLogAction(day, {
      ...next,
      highlights: next.highlights,
    }).catch(() => null);
    setSavingLog(false);
    if (!r?.ok) return errorToast(te, r && !r.ok ? r : "INTERNAL");
    toast.success(t("logSaved"), {
      action: { label: t("openBook"), onClick: () => router.push(`/write/${r.data.bookId}`) },
    });
  };

  const hours = log.productiveMinutes != null ? log.productiveMinutes / 60 : null;

  return (
    <div className="flex flex-col gap-5">
      {/* The day */}
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 bg-gradient-to-r from-[var(--c-amber)]/15 via-transparent to-[var(--c-violet)]/15 p-4 sm:p-5">
          <Button asChild variant="ghost" size="icon" aria-label={t("prevDay")}>
            <Link href={prevHref}>
              <ChevronLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1 text-center">
            {hijri && (
              <p className="text-muted flex items-center justify-center gap-1 text-xs font-medium">
                <Moon className="size-3.5" /> {hijri}
              </p>
            )}
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              {dateLabel.split(" | ")[0]}
              <span className="text-muted block text-sm font-medium sm:ml-2 sm:inline">
                <span className="max-sm:hidden">| </span>
                {dateLabel.split(" | ")[1]}
              </span>
            </h2>
            {!isToday && (
              <Link href="/plans" className="text-primary text-xs font-medium hover:underline">
                {t("backToToday")}
              </Link>
            )}
          </div>
          <Button asChild variant="ghost" size="icon" aria-label={t("nextDay")}>
            <Link href={nextHref}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        {/* Motto: stays until changed */}
        <div className="border-border border-t px-5 py-3">
          {mottoEdit ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setMottoEdit(false);
                void saveLog(log);
              }}
            >
              <Input
                autoFocus
                maxLength={300}
                value={log.motto ?? ""}
                placeholder={t("mottoPh")}
                onChange={(e) => setLog({ ...log, motto: e.target.value || null })}
              />
              <Button type="submit" size="sm">
                <Check />
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setMottoEdit(true)}
              className="text-muted hover:text-foreground flex w-full items-center gap-2 text-left text-sm italic"
            >
              <Quote className="size-4 shrink-0 text-[var(--c-amber)]" />
              {log.motto ? `«${log.motto}»` : t("mottoAdd")}
            </button>
          )}
        </div>
      </section>

      {/* The plan */}
      <section className="card p-5">
        <div className="mb-4 flex items-center gap-4">
          <div className="relative">
            <Ring pct={pct} />
            <span className="absolute inset-0 grid place-items-center text-sm font-bold tabular-nums">
              {pct}%
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{t("todayPlan")}</h3>
            <p className="text-muted text-sm">
              {items.length ? t("doneOf", { done, total: items.length }) : t("noItems")}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus /> {t("add")}
          </Button>
        </div>

        {items.length > 0 && (
          <ol ref={dragList as React.RefObject<HTMLOListElement>} className="flex flex-col gap-1.5">
            {shown.map((it) => (
              <li
                key={it.id}
                onPointerDown={(e) => dragStart(e, items.indexOf(it))}
                className={cn(
                  "group border-border flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                  it.done ? "border-[var(--c-emerald)]/30 bg-[var(--c-emerald)]/8" : "bg-surface",
                  dragged === it.id && "ring-primary/40 scale-[1.02] shadow-lg ring-2",
                )}
              >
                <GripVertical className="text-muted/50 size-4 shrink-0 cursor-grab max-sm:hidden" />
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={it.done}
                  aria-label={it.title}
                  onClick={() => void tick(it, !it.done)}
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    it.done
                      ? "border-[var(--c-emerald)] bg-[var(--c-emerald)] text-white"
                      : "border-border-strong hover:border-[var(--c-emerald)]",
                  )}
                >
                  {it.done && <Check className="size-4" strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "flex flex-wrap items-baseline gap-x-2 text-[15px] font-medium",
                      it.done && "text-muted line-through decoration-1",
                    )}
                  >
                    <span>{it.title}</span>
                    {it.amount && (
                      <span className="text-muted text-sm font-normal no-underline">
                        — {it.amount}
                      </span>
                    )}
                  </div>
                  {it.done && (
                    <input
                      defaultValue={it.note ?? ""}
                      maxLength={60}
                      placeholder={t("notePh")}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (it.note ?? "")) void tick(it, true, v);
                      }}
                      className="text-muted placeholder:text-muted/60 mt-0.5 w-full bg-transparent text-xs outline-none"
                    />
                  )}
                </div>
                {it.repeat !== "once" && (
                  <Repeat className="text-muted/60 size-3.5 shrink-0" aria-label={t("repeating")} />
                )}
                {it.time && (
                  <span className="bg-surface-2 text-muted inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums">
                    {it.alarm && <AlarmClock className="size-3" />} {it.time}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(it)}
                  className="text-muted hover:text-foreground rounded-md p-1 opacity-60 group-hover:opacity-100"
                  aria-label={t("editItem")}
                >
                  <Pencil className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        )}

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addQuick();
          }}
        >
          <Input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            maxLength={160}
            placeholder={t("quickPh")}
            aria-label={t("quickPh")}
          />
          <Button type="submit" variant="secondary" disabled={!quick.trim()}>
            <Plus />
          </Button>
        </form>
        {items.length > 1 && <p className="text-muted mt-2 text-xs">{t("dragHint")}</p>}
        {notif === "default" && (
          <button
            type="button"
            onClick={async () => {
              const p = await Notification.requestPermission().catch(() => "denied" as const);
              setNotif(p);
              if (p === "granted") toast.success(t("notifOn"));
            }}
            className="bg-primary-soft text-primary mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium"
          >
            <Bell className="size-4" /> {t("notifAsk")}
          </button>
        )}
      </section>

      {/* The day's page */}
      <section className="card flex flex-col gap-4 p-5">
        <div>
          <h3 className="font-semibold">{t("dayPage")}</h3>
          <p className="text-muted text-xs">{t("dayPageHint", { year: day.slice(0, 4) })}</p>
        </div>
        <Input
          value={log.title ?? ""}
          maxLength={200}
          placeholder={t("titlePh")}
          onChange={(e) => setLog({ ...log, title: e.target.value || null })}
          className="text-base font-semibold"
        />
        <Textarea
          rows={5}
          value={log.story ?? ""}
          maxLength={20000}
          placeholder={t("storyPh")}
          onChange={(e) => setLog({ ...log, story: e.target.value || null })}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">📌 {t("highlights")}</span>
          {log.highlights.length > 0 && (
            <ul className="flex flex-col gap-1">
              {log.highlights.map((h, i) => (
                <li
                  key={`${h}-${i}`}
                  className="bg-surface-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
                >
                  <span className="flex-1">• {h}</span>
                  <button
                    type="button"
                    aria-label={t("delete")}
                    className="text-muted hover:text-danger"
                    onClick={() =>
                      setLog({ ...log, highlights: log.highlights.filter((_, k) => k !== i) })
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const h = highlight.trim();
              if (!h) return;
              setLog({ ...log, highlights: [...log.highlights, h] });
              setHighlight("");
            }}
          >
            <Input
              value={highlight}
              maxLength={300}
              placeholder={t("highlightPh")}
              onChange={(e) => setHighlight(e.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!highlight.trim()}>
              <Plus />
            </Button>
          </form>
        </div>
        <details
          className="group"
          open={!!(log.lesson || log.productiveMinutes || log.better != null)}
        >
          <summary className="text-primary cursor-pointer text-sm font-medium">
            {t("conclusion")}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <Input
              value={log.lesson ?? ""}
              maxLength={1000}
              placeholder={`✍️ ${t("lessonPh")}`}
              onChange={(e) => setLog({ ...log, lesson: e.target.value || null })}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                ⏳ {t("productive")}
                <Input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  inputMode="decimal"
                  className="w-24"
                  value={hours ?? ""}
                  onChange={(e) =>
                    setLog({
                      ...log,
                      productiveMinutes:
                        e.target.value === "" ? null : Math.round(Number(e.target.value) * 60),
                    })
                  }
                />
                {t("hoursShort")}
              </label>
              {log.productiveMinutes != null && (
                <span className="bg-primary-soft text-primary rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums">
                  {productivePercent(log.productiveMinutes)}%
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>❓ {t("better")}</span>
              {([true, false] as const).map((b) => (
                <button
                  key={String(b)}
                  type="button"
                  onClick={() => setLog({ ...log, better: log.better === b ? null : b })}
                  className={cn(
                    "rounded-full border px-3 py-1 font-medium",
                    log.better === b
                      ? b
                        ? "border-[var(--c-emerald)] bg-[var(--c-emerald)]/15 text-[var(--c-emerald)]"
                        : "border-danger bg-danger-soft text-danger"
                      : "border-border text-muted",
                  )}
                >
                  {b ? `✅ ${t("yes")}` : `❌ ${t("no")}`}
                </button>
              ))}
            </div>
          </div>
        </details>
        <Button className="self-start" loading={savingLog} onClick={() => void saveLog()}>
          {t("saveDay")}
        </Button>
      </section>

      {editing && (
        <RoutineDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing === "new" ? null : editing}
          day={day}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

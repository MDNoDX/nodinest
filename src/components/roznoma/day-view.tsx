"use client";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Moon,
  Plus,
  Quote,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  checkRoutineAction,
  reorderRoutinesAction,
  saveDayLogAction,
  saveRoutineAction,
  setArchivedAction,
  syncDayAction,
} from "@/app/actions/roznoma";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import { uzScript } from "@/i18n/config";
import { dayPercent, hijriDate, productivePercent } from "@/lib/roznoma";
import { enqueue } from "@/lib/outbox";
import { useDragOrder } from "@/lib/use-drag-order";
import { PlanIcon } from "./plan-icon";
import { Dictate } from "./dictate";
import { PlanItem, type PlanRow, type PlanState, type SubRow } from "./plan-item";
import { RoutineDialog, type RoutineValue } from "./routine-dialog";

export type DayItem = PlanRow;
export type DayLogValue = {
  motto: string | null;
  title: string | null;
  story: string | null;
  highlights: string[];
  lesson: string | null;
  productiveMinutes: number | null;
  better: boolean | null;
};
export type StoredItem = RoutineValue & { id: string };

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
  today,
  dateLabel,
  prevHref,
  nextHref,
  initialItems,
  log: initialLog,
  motto: initialMotto,
  stored,
  userId,
}: {
  day: string;
  today: string;
  dateLabel: string;
  prevHref: string;
  nextHref: string;
  initialItems: DayItem[];
  log: DayLogValue;
  motto: string | null;
  /** The plans not on the day: "+ Add" picks from these. */
  stored: StoredItem[];
  userId: string;
}) {
  const t = useTranslations("roznoma");
  const locale = useLocale();
  // From the device's own date: no server and no network needed.
  const hijri = uzScript(locale, hijriDate(day, locale));
  const te = useTranslations("errors");
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [log, setLog] = useState<DayLogValue>({ ...initialLog, motto: initialMotto });
  const [editing, setEditing] = useState<{
    item: RoutineValue | null;
    parentId?: string;
    stored?: boolean;
  } | null>(null);
  const [picking, setPicking] = useState(false);
  // One short explanation, until it is closed.
  const [firstTime, setFirstTime] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("nn:plans-hint")) queueMicrotask(() => setFirstTime(true));
    } catch {
      /* no storage: no hint */
    }
  }, []);
  const [quick, setQuick] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [mottoEdit, setMottoEdit] = useState(false);
  const [highlight, setHighlight] = useState("");
  const [pageOpen, setPageOpen] = useState(
    !!(initialLog.title || initialLog.story || initialLog.highlights.length || initialLog.lesson),
  );
  const [notif, setNotif] = useState<NotificationPermission | "none">("none");
  useEffect(() => {
    queueMicrotask(() => setNotif("Notification" in window ? Notification.permission : "none"));
  }, []);

  const past = day < today;
  const done = items.filter((i) => i.status === "done").length;
  const pct = dayPercent(items);
  const rate =
    pct >= 100 ? t("rateAll") : pct >= 70 ? t("rateGood") : pct > 0 ? t("rateStart") : "";

  // The ticks reach the year's book a moment after the last one.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncSoon = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void syncDayAction(day), 2500);
  };

  const send = async (id: string, next: PlanState, before: DayItem[]) => {
    const r = await checkRoutineAction(id, day, {
      status: next.status,
      value: next.value,
      note: next.note2,
    }).catch(() => null);
    if (!r) {
      // No network: the tick stays and goes out when the connection is back.
      enqueue({
        kind: "check",
        id,
        day,
        state: { status: next.status, value: next.value, note: next.note2 },
      });
      return;
    }
    if (!r.ok) {
      setItems(before);
      errorToast(te, r);
    } else syncSoon();
  };
  const setState = (it: DayItem, next: PlanState) => {
    const before = items;
    const after = items.map((x) =>
      x.id === it.id
        ? {
            ...x,
            ...next,
            done: next.status === "done",
            subs: x.subs.map((s) => ({ ...s, ...next })),
          }
        : x,
    );
    setItems(after);
    if (next.status === "done" && dayPercent(after) === 100) toast.success(t("allDone"));
    void send(it.id, next, before);
  };
  const setSubState = (it: DayItem, sub: SubRow, next: PlanState) => {
    const before = items;
    setItems(
      items.map((x) => {
        if (x.id !== it.id) return x;
        const subs = x.subs.map((s) => (s.id === sub.id ? { ...s, ...next } : s));
        const p = dayPercent(subs);
        const status: DayItem["status"] =
          p >= 100 ? "done" : subs.some((s) => s.status) ? "partial" : null;
        return { ...x, subs, status, value: status === "partial" ? p : null, done: p >= 100 };
      }),
    );
    void send(sub.id, next, before);
  };

  // Holding a line and dragging moves it (nothing to learn, nothing in the way).
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

  const archive = async (ids: string[]) => {
    setItems((l) => l.filter((x) => !ids.includes(x.id)));
    const r = await setArchivedAction(ids, true);
    if (!r.ok) errorToast(te, r);
    else toast(t("archived"));
  };

  const addQuick = async () => {
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    // A new line for this day (it can be made regular by editing it).
    const r = await saveRoutineAction({ title, repeat: "once", onDay: day, alarm: false });
    if (!r.ok) return errorToast(te, r);
    router.refresh();
  };

  // The server's list after an add / edit.
  useEffect(() => {
    queueMicrotask(() => setItems(initialItems));
  }, [initialItems]);

  const saveLog = async (next = log) => {
    setSavingLog(true);
    const r = await saveDayLogAction(day, next).catch(() => null);
    setSavingLog(false);
    if (!r) {
      enqueue({ kind: "day", day, log: next });
      return void toast(t("savedOffline"));
    }
    if (!r.ok) return errorToast(te, r);
    toast.success(t("logSaved"), {
      action: r.data.bookId
        ? { label: t("openBook"), onClick: () => router.push(`/write/${r.data.bookId}`) }
        : undefined,
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
            {day !== today && (
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
      <section className="card p-4 sm:p-5">
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
            {rate && <p className="text-xs font-medium text-[var(--c-emerald)]">{rate}</p>}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => (stored.length ? setPicking(true) : setEditing({ item: null }))}
          >
            <Plus /> {t("add")}
          </Button>
        </div>

        {firstTime && (
          <div className="bg-primary-soft/60 mb-3 flex items-start gap-2 rounded-xl p-3 text-sm">
            <p className="min-w-0 flex-1">{t("simpleHint")}</p>
            <button
              type="button"
              aria-label={t("close")}
              className="text-muted hover:text-foreground"
              onClick={() => {
                setFirstTime(false);
                try {
                  localStorage.setItem("nn:plans-hint", "1");
                } catch {
                  /* it just shows again */
                }
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {items.length > 0 && (
          <ol ref={dragList as React.RefObject<HTMLOListElement>} className="flex flex-col gap-2">
            {shown.map((it) => (
              <div
                key={it.id}
                onPointerDown={(e) => dragStart(e, items.indexOf(it))}
                className={cn(
                  "transition-transform",
                  dragged === it.id && "ring-primary/40 scale-[1.02] rounded-2xl shadow-lg ring-2",
                )}
              >
                <PlanItem
                  it={it}
                  past={past}
                  onState={(n) => setState(it, n)}
                  onSubState={(sub, n) => setSubState(it, sub, n)}
                  onEdit={() => setEditing({ item: it })}
                  onArchive={() => void archive([it.id])}
                  onAddSub={() => setEditing({ item: null, parentId: it.id })}
                  onEditSub={(sub) => setEditing({ item: sub as never, parentId: it.id })}
                />
              </div>
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
          <Button type="submit" variant="secondary" disabled={!quick.trim()} aria-label={t("add")}>
            <Plus />
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {notif === "default" && (
            <button
              type="button"
              onClick={async () => {
                const p = await Notification.requestPermission().catch(() => "denied" as const);
                setNotif(p);
                if (p === "granted") toast.success(t("notifOn"));
              }}
              className="bg-primary-soft text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
            >
              <Bell className="size-3.5" /> {t("notifAsk")}
            </button>
          )}
        </div>
      </section>

      {/* The day's page */}
      <section className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setPageOpen((o) => !o)}
          aria-expanded={pageOpen}
          className="flex w-full items-center gap-3 p-5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t("dayPage")}</span>
            <span className="text-muted block text-xs">
              {t("dayPageHint", { year: day.slice(0, 4) })}
            </span>
          </span>
          <ChevronDown
            className={cn("text-muted size-5 transition-transform", pageOpen && "rotate-180")}
          />
        </button>
        <div className={cn("plan-more grid", pageOpen && "plan-more-open")}>
          <div className="overflow-hidden">
            <div className="flex flex-col gap-4 px-5 pb-5">
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
              <Dictate
                onText={(text) =>
                  setLog((l) => ({ ...l, story: l.story ? `${l.story}\n\n${text}` : text }))
                }
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
                              e.target.value === ""
                                ? null
                                : Math.round(Number(e.target.value) * 60),
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
                    <span>{t("better")}</span>
                    {([true, false] as const).map((b) => (
                      <button
                        key={String(b)}
                        type="button"
                        aria-pressed={log.better === b}
                        onClick={() => setLog({ ...log, better: log.better === b ? null : b })}
                        className={cn(
                          "rounded-full border px-3 py-1 font-medium transition active:scale-95",
                          log.better === b
                            ? b
                              ? "border-[var(--c-emerald)] bg-[var(--c-emerald)]/15 text-[var(--c-emerald)]"
                              : "border-[var(--c-amber)] bg-[var(--c-amber)]/15 text-[var(--c-amber)]"
                            : "border-border text-muted",
                        )}
                      >
                        {b ? t("betterYes") : t("betterNo")}
                      </button>
                    ))}
                  </div>
                </div>
              </details>
              <Button className="self-start" loading={savingLog} onClick={() => void saveLog()}>
                {t("saveDay")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {editing && (
        <RoutineDialog
          key={editing.item?.id ?? `new-${editing.parentId ?? ""}`}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing.item}
          parentId={editing.parentId}
          day={day}
          userId={userId}
          onSaved={() => router.refresh()}
        />
      )}
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent title={t("pickTitle")} closeLabel={t("close")}>
          {stored.length > 0 ? (
            <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
              {stored.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      setPicking(false);
                      const res = await setArchivedAction([r.id], false, day);
                      if (!res.ok) return errorToast(te, res);
                      router.refresh();
                    }}
                    className="hover:bg-surface-2 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
                  >
                    <span className="bg-primary-soft text-primary grid size-9 place-items-center rounded-xl">
                      <PlanIcon name={r.icon} className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="text-muted text-xs">
                        {[r.amount, r.time].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Plus className="text-muted size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">{t("pickEmpty")}</p>
          )}
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              setPicking(false);
              setEditing({ item: null });
            }}
          >
            <Plus /> {t("newItem")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

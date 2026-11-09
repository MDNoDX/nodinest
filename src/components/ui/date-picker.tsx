"use client";
/**
 * The app's own date picker (instead of the browser's, which speaks its own
 * language: "mm/dd/yyyy", "Clear", "Today"). A field that says the date in
 * words, and a window with quick choices ("in a month", "end of the year"),
 * a month grid that starts on Monday, the month & year view for far dates,
 * keys (arrows, PageUp/PageDown, Enter) and "Clear" / "Today" in our language.
 * The value is a day key "YYYY-MM-DD" or "".
 */
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtDay, type Loc } from "@/lib/format";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const parts = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return { y, m: m - 1, d };
};
const addDays = (k: string, n: number) => {
  const p = parts(k);
  return keyOf(p.y, p.m, p.d + n);
};
/** Months later, kept inside the month (31 Jan + 1 month = 28/29 Feb). */
const addMonths = (k: string, n: number) => {
  const p = parts(k);
  const last = new Date(Date.UTC(p.y, p.m + n + 1, 0)).getUTCDate();
  return keyOf(p.y, p.m + n, Math.min(p.d, last));
};
const daysBetween = (a: string, b: string) => {
  const x = parts(a);
  const y = parts(b);
  return Math.round((Date.UTC(y.y, y.m, y.d) - Date.UTC(x.y, x.m, x.d)) / 86_400_000);
};
const localToday = () => {
  const n = new Date();
  return keyOf(n.getFullYear(), n.getMonth(), n.getDate());
};

type Preset = "week" | "month" | "month3" | "month6" | "yearEnd" | "year";
const PRESETS: Record<Preset, (today: string) => string> = {
  week: (t) => addDays(t, 7),
  month: (t) => addMonths(t, 1),
  month3: (t) => addMonths(t, 3),
  month6: (t) => addMonths(t, 6),
  yearEnd: (t) => `${parts(t).y}-12-31`,
  year: (t) => addMonths(t, 12),
};

export function DatePicker({
  id,
  value,
  onChange,
  min,
  today: today0,
  presets = false,
  showLeft = false,
  placeholder,
  className,
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  /** Days before this are not offered. */
  min?: string;
  /** The person's own today (from the server, in their time zone). */
  today?: string;
  /** Quick choices for a deadline: in a week, a month, 3 / 6 months, the year's end, a year. */
  presets?: boolean;
  /** "45 days left" next to the date. */
  showLeft?: boolean;
  placeholder?: string;
  className?: string;
  "aria-describedby"?: string;
}) {
  const t = useTranslations("datePicker");
  const locale = useLocale() as Loc;
  const [open, setOpen] = useState(false);
  const today = today0 ?? localToday();
  const left = value ? daysBetween(today, value) : null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            aria-describedby={describedBy}
            className={cn(
              "border-border bg-surface hover:border-primary/50 focus-visible:border-primary focus-visible:ring-primary/30 flex h-11 w-full items-center gap-2.5 rounded-xl border px-3.5 text-left text-base transition outline-none focus-visible:ring-2 sm:text-sm",
              open && "border-primary ring-primary/30 ring-2",
            )}
          >
            <CalendarDays className="text-primary size-[18px] shrink-0" />
            {value ? (
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">
                  {fmtDay(value, locale, { day: "numeric", month: "long", year: "numeric" })}
                </span>
                {showLeft && left !== null && left >= 0 && (
                  <span className="text-muted"> · {t("left", { n: left })}</span>
                )}
              </span>
            ) : (
              <span className="text-muted flex-1 truncate">{placeholder ?? t("choose")}</span>
            )}
            {/* room for the clear button */}
            {value && <span className="w-6 shrink-0" />}
          </button>
        </Popover.Trigger>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("clear")}
            title={t("clear")}
            className="text-muted hover:bg-surface-2 hover:text-foreground absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="border-border bg-surface data-[state=open]:animate-scale-in z-[60] w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border p-3 shadow-2xl outline-none"
        >
          <Calendar
            value={value}
            min={min}
            today={today}
            presets={presets}
            onPick={(v) => {
              onChange(v);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Calendar({
  value,
  min,
  today,
  presets,
  onPick,
}: {
  value: string;
  min?: string;
  today: string;
  presets: boolean;
  onPick: (v: string) => void;
}) {
  const t = useTranslations("datePicker");
  const tr = useTranslations("roznoma");
  const locale = useLocale() as Loc;
  const start = value || (min && min > today ? min : today);
  // The day the keys move (and the month shown follows it).
  const [focus, setFocus] = useState(start);
  const [view, setView] = useState<"days" | "months">("days");
  const [year, setYear] = useState(parts(start).y);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const { y, m } = parts(focus);
  const ok = (k: string) => !min || k >= min;

  // Keys move the focus; the focused day takes the keyboard focus too.
  useEffect(() => {
    if (!moved.current) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus]);

  const weekdays = tr("weekdaysShort").split(",");
  // Monday first: how many days of the month before stand in the first row.
  const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const inMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const rows = Math.ceil((first + inMonth) / 7);
  const days = Array.from({ length: rows * 7 }, (_, i) => keyOf(y, m, i - first + 1));
  const monthName = (mm: number, style: "long" | "short" = "long") =>
    fmtDay(keyOf(2026, mm, 1), locale, { month: style });
  const title = fmtDay(keyOf(y, m, 1), locale, { month: "long", year: "numeric" });

  const move = (k: string) => {
    moved.current = true;
    setFocus(k);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -((parts(focus).d + first - 1) % 7)),
      End: () => addDays(focus, 6 - ((parts(focus).d + first - 1) % 7)),
    };
    if (step[e.key]) {
      e.preventDefault();
      move(step[e.key]());
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {presets && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PRESETS) as Preset[]).map((p) => {
            const k = PRESETS[p](today);
            if (!ok(k)) return null;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPick(k)}
                title={fmtDay(k, locale, { day: "numeric", month: "long", year: "numeric" })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  value === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:border-primary hover:text-primary",
                )}
              >
                {t(`preset.${p}`)}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setView((v) => (v === "days" ? "months" : "days"))}
          aria-expanded={view === "months"}
          aria-label={t("pickMonth")}
          className="hover:bg-surface-2 mr-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold capitalize"
        >
          {view === "days" ? title : year}
          <ChevronDown
            className={cn(
              "text-muted size-4 transition-transform",
              view === "months" && "rotate-180",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => (view === "days" ? setFocus(addMonths(focus, -1)) : setYear((x) => x - 1))}
          aria-label={view === "days" ? t("prev") : t("prevYear")}
          className="text-muted hover:bg-surface-2 hover:text-foreground grid size-8 place-items-center rounded-lg"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => (view === "days" ? setFocus(addMonths(focus, 1)) : setYear((x) => x + 1))}
          aria-label={view === "days" ? t("next") : t("nextYear")}
          className="text-muted hover:bg-surface-2 hover:text-foreground grid size-8 place-items-center rounded-lg"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {view === "months" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, mm) => {
            const here = year === y && mm === m;
            const past = !!min && keyOf(year, mm + 1, 0) < min;
            return (
              <button
                key={mm}
                type="button"
                disabled={past}
                onClick={() => {
                  setFocus(keyOf(year, mm, Math.min(parts(focus).d, 28)));
                  setView("days");
                }}
                className={cn(
                  "rounded-xl py-2.5 text-sm capitalize transition disabled:opacity-30",
                  here ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-surface-2",
                )}
              >
                {monthName(mm, "short")}
              </button>
            );
          })}
        </div>
      ) : (
        <div ref={grid} role="grid" aria-label={title} onKeyDown={onKey}>
          <div role="row" className="mb-1 grid grid-cols-7">
            {weekdays.map((w, i) => (
              <span
                key={w}
                role="columnheader"
                className={cn(
                  "text-muted py-1 text-center text-[11px] font-semibold uppercase",
                  i >= 5 && "text-[var(--c-rose)]",
                )}
              >
                {w}
              </span>
            ))}
          </div>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} role="row" className="grid grid-cols-7 gap-0.5">
              {days.slice(r * 7, r * 7 + 7).map((k) => {
                const p = parts(k);
                const other = p.m !== m;
                const picked = k === value;
                const isToday = k === today;
                return (
                  <button
                    key={k}
                    type="button"
                    role="gridcell"
                    data-day={k}
                    disabled={!ok(k)}
                    aria-selected={picked}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={fmtDay(k, locale, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    tabIndex={k === focus ? 0 : -1}
                    onClick={() => onPick(k)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPick(k);
                      }
                    }}
                    className={cn(
                      "relative grid aspect-square place-items-center rounded-xl text-sm tabular-nums transition outline-none",
                      "focus-visible:ring-primary/60 focus-visible:ring-2",
                      "disabled:pointer-events-none disabled:opacity-25",
                      picked
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "hover:bg-surface-2",
                      !picked && other && "text-muted/60",
                      !picked && isToday && "text-primary font-bold",
                    )}
                  >
                    {p.d}
                    {isToday && !picked && (
                      <span className="bg-primary absolute bottom-1 size-1 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="border-border flex items-center justify-between border-t pt-2">
        <button
          type="button"
          onClick={() => onPick("")}
          disabled={!value}
          className="text-muted hover:text-foreground rounded-lg px-2 py-1 text-sm font-medium disabled:opacity-40"
        >
          {t("clear")}
        </button>
        <button
          type="button"
          onClick={() => onPick(today)}
          disabled={!ok(today)}
          className="text-primary hover:bg-primary-soft rounded-lg px-2 py-1 text-sm font-semibold disabled:opacity-40"
        >
          {t("today")}
        </button>
      </div>
    </div>
  );
}

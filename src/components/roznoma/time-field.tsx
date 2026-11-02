"use client";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { clockText, useHour12 } from "@/lib/time-format";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The digits in a box after a key: a key typed into a full box starts it again
 * (the "00" shown is not part of what is typed).
 */
export function typedDigits(raw: string, before: string) {
  const all = raw.replace(/\D/g, "");
  if (all.length <= 2) return all;
  if (all.startsWith(before)) return all.slice(before.length).slice(0, 2);
  if (all.endsWith(before)) return all.slice(0, all.length - before.length).slice(-2);
  return all.slice(-2);
}
const SIZE = 248;
const C = SIZE / 2;
const OUTER = 98;
const INNER = 64;

/** Where a number sits on the dial: `i` of 12 steps, 0 at the top. */
const spot = (i: number, r: number) => {
  const a = (i / 12) * 2 * Math.PI;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};

/**
 * A time picked on a clock face, or typed into the hour and minute boxes above
 * it. 24 hours (an inner ring holds 13–00), AM / PM when this device chose it in
 * Settings. Empty means "no set time"; the value is always "HH:MM" (24 h).
 */
export function TimeField({
  value,
  onChange,
  id,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("dates");
  const h12 = useHour12();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"h" | "m">("h");
  const hour = value ? Number(value.slice(0, 2)) : null;
  const minute = value ? Number(value.slice(3, 5)) : null;
  // What is being typed stays as typed until it makes a whole number.
  const [typed, setTyped] = useState<{ h: string; m: string } | null>(null);
  const minuteBox = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const pm = (hour ?? 0) >= 12;

  const set = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);
  const shownHour = typed?.h ?? (hour == null ? "" : pad(h12 ? hour % 12 || 12 : hour));
  const shownMinute = typed?.m ?? (minute == null ? "" : pad(minute));

  const typeHour = (raw: string) => {
    const d = typedDigits(raw, shownHour);
    setTyped({ h: d, m: shownMinute });
    const n = Number(d);
    const max = h12 ? 12 : 23;
    // Two digits, or one that cannot start a bigger hour: the hour is done.
    if (d && (d.length === 2 || n > (h12 ? 1 : 2)) && n <= max) {
      const real = h12 ? (n % 12) + (pm ? 12 : 0) : n;
      set(real, minute ?? 0);
      setTyped(null);
      setMode("m");
      // After the new value is drawn, so the next key replaces the minutes.
      setTimeout(() => {
        minuteBox.current?.focus();
        minuteBox.current?.select();
      });
    }
  };
  const typeMinute = (raw: string) => {
    const d = typedDigits(raw, shownMinute);
    setTyped({ h: shownHour, m: d });
    const n = Number(d);
    if (d && (d.length === 2 || n > 5) && n <= 59) {
      set(hour ?? 0, n);
      setTyped(null);
    }
  };

  /** A press or drag on the dial: the number under the finger. */
  const pick = (e: React.PointerEvent<SVGSVGElement>, done: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SIZE - C;
    const y = ((e.clientY - r.top) / r.height) * SIZE - C;
    const a = (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI);
    if (mode === "h") {
      const i = Math.round((a / (2 * Math.PI)) * 12) % 12;
      const inner = !h12 && Math.hypot(x, y) < (OUTER + INNER) / 2;
      let h = inner ? (i === 0 ? 0 : i + 12) : i === 0 ? 12 : i;
      if (h12) h = (h % 12) + (pm ? 12 : 0);
      set(h, minute ?? 0);
      if (done) setMode("m");
    } else {
      set(hour ?? 0, Math.round((a / (2 * Math.PI)) * 60) % 60);
    }
    setTyped(null);
  };

  // The hand points at the hour or the minute being set.
  const hand =
    mode === "h"
      ? hour == null
        ? null
        : spot(hour % 12, !h12 && (hour === 0 || hour > 12) ? INNER : OUTER)
      : minute == null
        ? null
        : spot(minute / 5, OUTER);

  const box = (on: boolean) =>
    cn(
      "h-16 w-[4.5rem] rounded-xl text-center text-4xl font-semibold tabular-nums outline-none transition-colors",
      on ? "bg-primary-soft text-primary" : "bg-surface-2 text-foreground",
    );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setTyped(null);
        if (o) setMode("h");
      }}
    >
      <Dialog.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className="border-border-strong bg-surface hover:border-primary/60 flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2.5 text-sm tabular-nums transition-colors disabled:opacity-50"
        >
          <Clock className="text-muted size-4 shrink-0" />
          <span className={cn("truncate", !value && "text-muted")}>
            {value ? clockText(value, h12) : "--:--"}
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        {/* Like the phone's clock: a small window in the middle, never off the screen. */}
        <Dialog.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-[80] bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-surface border-border animate-scale-in fixed top-1/2 left-1/2 z-[80] flex max-h-[calc(100dvh-1.5rem)] w-[18.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 overflow-y-auto rounded-3xl border p-4 shadow-xl"
        >
          <Dialog.Title className="text-muted self-start text-[11px] font-semibold tracking-wide uppercase">
            {t("pickTime")}
          </Dialog.Title>
          <div className="flex items-center gap-2">
            <input
              aria-label={t("hour")}
              inputMode="numeric"
              placeholder="--"
              value={shownHour}
              onFocus={(e) => {
                setMode("h");
                e.currentTarget.select();
              }}
              onChange={(e) => typeHour(e.target.value)}
              className={box(mode === "h")}
            />
            <span className="text-3xl font-semibold">:</span>
            <input
              ref={minuteBox}
              aria-label={t("minute")}
              inputMode="numeric"
              placeholder="--"
              value={shownMinute}
              onFocus={(e) => {
                setMode("m");
                e.currentTarget.select();
              }}
              onChange={(e) => typeMinute(e.target.value)}
              className={box(mode === "m")}
            />
            {h12 && (
              <div className="border-border-strong ml-1 flex flex-col overflow-hidden rounded-lg border text-xs font-semibold">
                {[false, true].map((p) => (
                  <button
                    key={String(p)}
                    type="button"
                    aria-pressed={pm === p}
                    onClick={() => set(((hour ?? 0) % 12) + (p ? 12 : 0), minute ?? 0)}
                    className={cn(
                      "px-2 py-1.5",
                      pm === p ? "bg-primary-soft text-primary" : "text-muted",
                    )}
                  >
                    {p ? "PM" : "AM"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="size-[min(248px,calc(100dvh-15rem))] shrink-0 touch-none select-none"
            role="listbox"
            aria-label={mode === "h" ? t("hour") : t("minute")}
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              pick(e, false);
            }}
            onPointerMove={(e) => dragging.current && pick(e, false)}
            onPointerUp={(e) => {
              // Only a press that began on the dial picks (not a release after
              // the press that opened this window).
              if (!dragging.current) return;
              dragging.current = false;
              pick(e, true);
            }}
            onPointerCancel={() => (dragging.current = false)}
          >
            <circle cx={C} cy={C} r={C - 2} className="fill-[var(--surface-2)]" />
            {hand && (
              <g className="text-primary">
                <line x1={C} y1={C} x2={hand.x} y2={hand.y} stroke="currentColor" strokeWidth={2} />
                <circle cx={C} cy={C} r={4} fill="currentColor" />
                <circle cx={hand.x} cy={hand.y} r={17} fill="currentColor" />
              </g>
            )}
            {(mode === "h"
              ? [
                  ...Array.from({ length: 12 }, (_, i) => ({
                    n: i === 0 ? 12 : i,
                    i,
                    r: OUTER,
                    on: hour != null && (h12 ? hour % 12 === i % 12 : hour === (i === 0 ? 12 : i)),
                  })),
                  ...(h12
                    ? []
                    : Array.from({ length: 12 }, (_, i) => ({
                        n: i === 0 ? 0 : i + 12,
                        i,
                        r: INNER,
                        on: hour === (i === 0 ? 0 : i + 12),
                      }))),
                ]
              : Array.from({ length: 12 }, (_, i) => ({
                  n: i * 5,
                  i,
                  r: OUTER,
                  on: minute === i * 5,
                }))
            ).map(({ n, i, r, on }) => {
              const p = spot(i, r);
              return (
                <text
                  key={`${r}-${i}`}
                  x={p.x}
                  y={p.y}
                  dy="0.35em"
                  textAnchor="middle"
                  className={cn(
                    "pointer-events-none tabular-nums",
                    r === INNER ? "text-[12px]" : "text-[14px]",
                    on
                      ? "fill-[var(--primary-foreground)] font-semibold"
                      : "fill-[var(--foreground)]",
                    r === INNER && !on && "opacity-70",
                  )}
                >
                  {mode === "m" || r === INNER ? pad(n) : n}
                </text>
              );
            })}
          </svg>
          {/* Quick picks: now, and a little later. */}
          <div className="flex w-full gap-1.5">
            {[0, 15, 60].map((add) => (
              <button
                key={add}
                type="button"
                onClick={() => {
                  const d = new Date(Date.now() + add * 60_000);
                  set(d.getHours(), d.getMinutes());
                  setTyped(null);
                }}
                className="border-border hover:bg-surface-2 flex-1 rounded-full border px-2 py-1 text-xs font-medium"
              >
                {add === 0 ? t("now") : add === 60 ? t("plusHour") : t("plusMin", { n: add })}
              </button>
            ))}
          </div>
          <div className="flex w-full items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!value}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              {t("clearTime")}
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              {t("timeDone")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

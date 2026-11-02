"use client";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { Visual } from "@/server/ai/assistant";

export type { Visual };

/** One step after another, as if drawn while it is explained (then it stays). */
function usePlay(n: number, ms: number) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (n < 2) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setInterval(
      () =>
        setAt((x) => {
          if (reduced || x >= n - 1) {
            clearInterval(timer);
            return n - 1;
          }
          return x + 1;
        }),
      reduced ? 0 : ms,
    );
    return () => clearInterval(timer);
  }, [n, ms]);
  return at;
}

function Steps({ steps }: { steps: NonNullable<Visual["steps"]> }) {
  const at = usePlay(steps.length, 1600);
  return (
    <ol className="relative flex flex-col gap-3">
      {steps.map((s, i) => (
        <li
          key={i}
          className={cn(
            "relative flex gap-3 transition-all duration-500",
            i > at ? "translate-y-1 opacity-25" : "opacity-100",
          )}
        >
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className="absolute top-7 bottom-[-0.75rem] left-[13px] w-0.5 overflow-hidden rounded-full bg-current/10"
            >
              <span
                className="block w-full rounded-full bg-[var(--c-amber)] transition-[height] duration-700"
                style={{ height: i < at ? "100%" : "0%" }}
              />
            </span>
          )}
          <span
            className={cn(
              "relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-500",
              i < at
                ? "bg-[var(--c-amber)] text-black"
                : i === at
                  ? "visual-pulse bg-[var(--c-amber)] text-black"
                  : "bg-current/10",
            )}
          >
            {i < at ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className="min-w-0 pt-0.5">
            <span className="block font-medium">{s.title}</span>
            {s.text && <span className="block text-xs leading-relaxed opacity-75">{s.text}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Timeline({ items }: { items: NonNullable<Visual["timeline"]> }) {
  const at = usePlay(items.length, 1300);
  return (
    <ol className="relative ml-1.5 border-l-2 border-current/10 pl-4">
      <span
        aria-hidden
        className="absolute top-0 -left-0.5 w-0.5 rounded-full bg-[var(--c-amber)] transition-[height] duration-1000"
        style={{ height: `${((at + 1) / items.length) * 100}%` }}
      />
      {items.map((e, i) => (
        <li
          key={i}
          className={cn(
            "relative pb-3 transition-all duration-500 last:pb-0",
            i > at ? "translate-x-2 opacity-0" : "opacity-100",
          )}
        >
          <span
            aria-hidden
            className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full bg-[var(--c-amber)] ring-4 ring-[var(--c-amber)]/20"
          />
          <span className="block text-xs font-semibold tracking-wide text-[var(--c-amber)]">
            {e.when}
          </span>
          <span className="block leading-snug">{e.what}</span>
        </li>
      ))}
    </ol>
  );
}

function Compare({ c }: { c: NonNullable<Visual["compare"]> }) {
  const at = usePlay(c.rows.length, 900);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
        <span className="rounded-lg bg-[var(--c-amber)]/15 px-2 py-1 text-center text-[var(--c-amber)]">
          {c.left}
        </span>
        <span className="rounded-lg bg-sky-400/15 px-2 py-1 text-center text-sky-400">
          {c.right}
        </span>
      </div>
      {c.rows.map((r, i) => (
        <div key={i} className={cn("transition-opacity duration-500", i > at && "opacity-0")}>
          {r.label && <p className="mt-1 text-center text-[11px] opacity-60">{r.label}</p>}
          <div className="grid grid-cols-2 gap-2">
            <span
              className={cn(
                "rounded-lg bg-current/5 px-2 py-1.5 text-xs leading-snug transition-transform duration-500",
                i > at && "-translate-x-3",
              )}
            >
              {r.left}
            </span>
            <span
              className={cn(
                "rounded-lg bg-current/5 px-2 py-1.5 text-xs leading-snug transition-transform duration-500",
                i > at && "translate-x-3",
              )}
            >
              {r.right}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A card the AI shows beside its words: points, a chart, a quiz, steps, a timeline or a comparison. */
export function VisualCard({ v, floating }: { v: Visual; floating?: boolean }) {
  const [picked, setPicked] = useState<number | null>(null);
  const max = Math.max(1, ...(v.chart ?? []).map((c) => Math.abs(c.value)));
  return (
    <section
      className={cn(
        "visual-card rounded-2xl border p-4 text-sm",
        floating
          ? "border-white/15 bg-white/8 text-white shadow-2xl backdrop-blur-xl"
          : "border-border bg-surface",
      )}
    >
      <h3 className="mb-2 font-semibold">{v.title}</h3>
      {v.points && (
        <ul className="flex flex-col gap-1.5">
          {v.points.map((p, i) => (
            <li key={i} className="flex gap-2" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--c-amber)]" />
              {p}
            </li>
          ))}
        </ul>
      )}
      {v.chart && (
        <ul className="flex flex-col gap-1.5" aria-label={v.title}>
          {v.chart.map((c) => (
            <li key={c.label}>
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate">{c.label}</span>
                <span className="tabular-nums opacity-80">{c.value}</span>
              </div>
              <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-current/10">
                <div
                  className="visual-bar h-full rounded-full bg-[var(--c-amber)]"
                  style={{ width: `${(Math.abs(c.value) / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {v.steps && v.steps.length > 0 && <Steps steps={v.steps} />}
      {v.timeline && v.timeline.length > 0 && <Timeline items={v.timeline} />}
      {v.compare && v.compare.rows.length > 0 && <Compare c={v.compare} />}
      {v.quiz && (
        <div>
          <p className="mb-2 font-medium">{v.quiz.question}</p>
          <div className="flex flex-col gap-1.5">
            {v.quiz.options.map((o, i) => {
              const right = picked !== null && i === v.quiz!.answer;
              const wrong = picked === i && i !== v.quiz!.answer;
              return (
                <button
                  key={o}
                  type="button"
                  disabled={picked !== null}
                  onClick={() => setPicked(i)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border border-current/15 px-3 py-1.5 text-left transition",
                    right && "border-[var(--c-emerald)] text-[var(--c-emerald)]",
                    wrong && "border-red-400 text-red-400",
                  )}
                >
                  <span className="min-w-0 flex-1">{o}</span>
                  {right && <Check className="size-4" />}
                  {wrong && <X className="size-4" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

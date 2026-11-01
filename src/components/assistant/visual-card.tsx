"use client";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export type Visual = {
  title: string;
  points?: string[];
  chart?: { label: string; value: number }[];
  quiz?: { question: string; options: string[]; answer: number };
};

/** A card the AI shows beside its words: points, a bar chart or a quiz. */
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

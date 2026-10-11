"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Single-series vertical bar chart (one hue, thin bars with rounded data
 * ends, recessive grid). Hover/focus shows a tooltip; an sr-only table
 * provides the accessible view. No legend: the card title names the series.
 */
export function BarChart({
  data,
  height = 160,
  ariaLabel,
  highlightLast,
}: {
  /** `display` is the pre-formatted value (functions can't cross to the client). */
  data: { label: string; short?: string; value: number; display: string }[];
  height?: number;
  ariaLabel: string;
  highlightLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const labelEvery = n > 16 ? Math.ceil(n / 8) : 1;
  return (
    <figure className="relative">
      <div className="relative" style={{ height }} role="img" aria-label={ariaLabel}>
        {/* grid */}
        {[0.5, 1].map((g) => (
          <div
            key={g}
            className="border-border absolute inset-x-0 border-t border-dashed"
            style={{ bottom: `${g * 100}%` }}
            aria-hidden
          />
        ))}
        <div className="border-border-strong absolute inset-x-0 bottom-0 border-t" aria-hidden />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d, i) => {
            const h = d.value > 0 ? Math.max(2, (d.value / max) * 100) : 0;
            const active = hover === i;
            return (
              <button
                type="button"
                key={i}
                className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${d.label}: ${d.display}`}
              >
                <span
                  className={cn(
                    "w-full max-w-7 rounded-t-[4px] transition-opacity",
                    highlightLast && i === n - 1 ? "bg-accent" : "bg-primary",
                    hover !== null && !active && "opacity-50",
                  )}
                  style={{ height: `${h}%` }}
                />
                {active && (
                  <span className="border-border bg-surface text-foreground pointer-events-none absolute bottom-full z-10 mb-1 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-md">
                    <span className="text-muted">{d.label}</span> ·{" "}
                    <span className="font-semibold tabular-nums">{d.display}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px]" aria-hidden>
        {data.map((d, i) => (
          <span key={i} className="text-muted flex-1 truncate text-center text-[10px]">
            {i % labelEvery === 0 ? (d.short ?? d.label) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.label}</th>
              <td>{d.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

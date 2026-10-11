/**
 * Ranked horizontal bars (magnitude by category) — one hue, text labels in
 * ink tokens, values right-aligned. Works as its own accessible list.
 */
export function HBarList({
  items,
  formatValue,
  emptyLabel,
}: {
  items: { key: string; label: React.ReactNode; value: number; href?: string }[];
  formatValue: (v: number) => string;
  emptyLabel?: React.ReactNode;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-muted py-4 text-sm">{emptyLabel}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li
          key={i.key}
          className="text-sm"
          title={`${typeof i.label === "string" ? i.label : ""} ${formatValue(i.value)}`}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">
              {i.href ? (
                <a className="hover:underline" href={i.href}>
                  {i.label}
                </a>
              ) : (
                i.label
              )}
            </span>
            <span className="text-muted shrink-0 text-xs tabular-nums">{formatValue(i.value)}</span>
          </div>
          <div className="bg-surface-2 h-1.5 rounded-full" aria-hidden>
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="bg-surface-2 h-2 overflow-hidden rounded-full"
    >
      <div
        className={pct >= 100 ? "bg-success h-full rounded-full" : "bg-primary h-full rounded-full"}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

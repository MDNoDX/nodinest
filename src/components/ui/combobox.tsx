"use client";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/hooks";

export type ComboOption = { id: string; label: string; detail?: string | null; create?: boolean };

/**
 * Accessible, database-backed autocomplete (ARIA combobox pattern).
 * Results update while typing; ↑/↓ to move, Enter to pick, Esc to close.
 */
export function Combobox({
  endpoint,
  onPick,
  placeholder,
  createLabel,
  mapItem,
  id,
  ariaLabel,
  minChars = 1,
  ...aria
}: {
  endpoint: string;
  onPick: (opt: ComboOption) => void;
  placeholder?: string;
  /** When set, offers a "create <query>" option. */
  createLabel?: (q: string) => string;
  mapItem: (raw: Record<string, unknown>) => ComboOption;
  id?: string;
  ariaLabel?: string;
  minChars?: number;
  "aria-describedby"?: string;
}) {
  const auto = useId();
  const listId = `${id ?? auto}-list`;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ComboOption[]>([]);
  const [active, setActive] = useState(0);
  const [loadedFor, setLoadedFor] = useState("");
  const debounced = useDebounced(q, 150);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = debounced.trim();
    if (term.length < minChars) return;
    const ctrl = new AbortController();
    fetch(`${endpoint}?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: Record<string, unknown>[] }) => {
        setItems(d.items.map(mapItem));
        setActive(0);
        setLoadedFor(term);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [debounced, endpoint, mapItem, minChars]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const term = q.trim();
  const shown = term.length < minChars ? [] : items;
  const loading = term.length >= minChars && debounced.trim() !== loadedFor;
  const options: ComboOption[] = [
    ...shown,
    ...(createLabel && term && !shown.some((i) => i.label.toLowerCase() === term.toLowerCase())
      ? [{ id: `create:${term}`, label: createLabel(term), create: true }]
      : []),
  ];
  const pick = (o: ComboOption) => {
    onPick(o.create ? { ...o, label: term } : o);
    setQ("");
    setItems([]);
    setOpen(false);
  };

  return (
    <div ref={wrap} className="relative">
      <input
        id={id}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (open && options[active]) {
              e.preventDefault();
              pick(options[active]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="border-border-strong bg-surface placeholder:text-muted/80 focus-visible:border-ring focus-visible:outline-ring/40 h-10 w-full rounded-lg border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-0"
        {...aria}
      />
      {loading && (
        <span
          className="border-muted absolute top-1/2 right-3 size-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-r-transparent"
          aria-hidden
        />
      )}
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="border-border bg-surface animate-fade-in absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border p-1 shadow-xl"
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "cursor-pointer rounded-lg px-3 py-2 text-sm",
                i === active && "bg-surface-2",
                o.create && "text-primary font-medium",
              )}
            >
              <div className="truncate">{o.label}</div>
              {o.detail && <div className="text-muted truncate text-xs">{o.detail}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

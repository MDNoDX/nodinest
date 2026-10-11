"use client";
import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** Chip input: Enter or comma adds, Backspace on empty removes the last chip. */
export function TagInput({
  value,
  onChange,
  placeholder,
  id,
  max = 20,
  removeLabel = "Remove",
  ...aria
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  id?: string;
  max?: number;
  removeLabel?: string;
  "aria-describedby"?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "");
    if (!v || value.includes(v) || value.length >= max) return;
    onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="border-border-strong bg-surface focus-within:border-ring flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5">
      {value.map((v) => (
        <span
          key={v}
          className="bg-surface-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm"
        >
          {v}
          <button
            type="button"
            aria-label={`${removeLabel} ${v}`}
            className="text-muted hover:text-foreground"
            onClick={() => onChange(value.filter((x) => x !== v))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={value.length ? undefined : placeholder}
        onChange={(e) =>
          e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value)
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        className={cn(
          "placeholder:text-muted/80 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none",
        )}
        {...aria}
      />
    </div>
  );
}

"use client";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

const to12 = (v: string) => {
  const h = Number(v.slice(0, 2));
  return {
    text: `${String(h % 12 || 12).padStart(2, "0")}:${v.slice(3, 5)}`,
    pm: h >= 12,
  };
};
const to24 = (text: string, pm: boolean) => {
  const h = Number(text.slice(0, 2)) % 12;
  return `${String(pm ? h + 12 : h).padStart(2, "0")}:${text.slice(3, 5)}`;
};
/** Digits become HH:MM while typing ("540" → "05:40", "0540" → "05:40"). */
function mask(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length < 3) return d;
  const dd = d.length === 3 ? `0${d}` : d;
  return `${dd.slice(0, 2)}:${dd.slice(2)}`;
}
const valid = (t: string, max: number) =>
  /^\d{2}:\d{2}$/.test(t) && Number(t.slice(0, 2)) <= max && Number(t.slice(3)) <= 59;

/**
 * A time typed by hand: 24 hours in Uzbek and Russian, AM / PM in English.
 * Empty means "no set time". The value is always "HH:MM" (24 h).
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
  const ampm = useLocale() === "en";
  const initial = value ? (ampm ? to12(value).text : value) : "";
  const [text, setText] = useState(initial);
  const [pm, setPm] = useState(value ? to12(value).pm : false);
  const commit = (t: string, p = pm) => {
    if (!t) return onChange(null);
    if (valid(t, ampm ? 12 : 23)) onChange(ampm ? to24(t, p) : t);
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex-1">
        <Input
          id={id}
          disabled={disabled}
          inputMode="numeric"
          placeholder={ampm ? "07:30" : "05:40"}
          maxLength={5}
          className="pr-8 tabular-nums"
          value={text}
          onChange={(e) => {
            const t = mask(e.target.value);
            setText(t);
            commit(t);
          }}
        />
        {text && !disabled && (
          <button
            type="button"
            aria-label="×"
            className="text-muted hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            onClick={() => {
              setText("");
              onChange(null);
            }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {ampm && (
        <div className="bg-surface-2 flex rounded-lg p-0.5 text-xs font-semibold">
          {[false, true].map((p) => (
            <button
              key={String(p)}
              type="button"
              onClick={() => {
                setPm(p);
                commit(text, p);
              }}
              className={cn(
                "rounded-md px-2 py-1.5",
                pm === p ? "bg-surface shadow-sm" : "text-muted",
              )}
            >
              {p ? "PM" : "AM"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

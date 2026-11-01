"use client";
import { Clock, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Popover } from "radix-ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { clockText, useHour12 } from "@/lib/time-format";

const pad = (n: number) => String(n).padStart(2, "0");
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

/** Digits become HH:MM while typing ("540" → "05:40", "0540" → "05:40"). */
function mask(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length < 3) return d;
  const dd = d.length === 3 ? `0${d}` : d;
  return `${dd.slice(0, 2)}:${dd.slice(2)}`;
}
const valid = (t: string) =>
  /^\d{2}:\d{2}$/.test(t) && Number(t.slice(0, 2)) <= 23 && Number(t.slice(3)) <= 59;

function Cell({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-9 rounded-lg text-sm font-medium tabular-nums transition-colors",
        on ? "bg-primary text-primary-foreground" : "hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A time picked by pressing the hour and the minute, or typed. 24 hours, AM /
 * PM when this device chose it in Settings. Empty means "no set time"; the
 * value is always "HH:MM" (24 h).
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
  const [text, setText] = useState(value ?? "");
  const hour = value ? Number(value.slice(0, 2)) : null;
  const minute = value ? Number(value.slice(3, 5)) : null;
  const pm = (hour ?? 0) >= 12;
  const set = (h: number, m: number) => {
    const v = `${pad(h)}:${pad(m)}`;
    setText(v);
    onChange(v);
  };
  const hours = h12
    ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    : Array.from({ length: 24 }, (_, i) => i);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
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
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="bg-surface border-border z-[80] flex w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col gap-3 rounded-2xl border p-3 shadow-xl"
        >
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              placeholder="05:40"
              maxLength={5}
              aria-label={t("time")}
              className="flex-1 tabular-nums"
              value={text}
              onChange={(e) => {
                const v = mask(e.target.value);
                setText(v);
                if (valid(v)) onChange(v);
              }}
            />
            {h12 && (
              <div className="bg-surface-2 flex rounded-lg p-0.5 text-xs font-semibold">
                {[false, true].map((p) => (
                  <button
                    key={String(p)}
                    type="button"
                    onClick={() => set(((hour ?? 0) % 12) + (p ? 12 : 0), minute ?? 0)}
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
            {value && (
              <button
                type="button"
                aria-label={t("clearTime")}
                title={t("clearTime")}
                className="text-muted hover:text-foreground grid size-9 place-items-center rounded-lg"
                onClick={() => {
                  setText("");
                  onChange(null);
                  setOpen(false);
                }}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div>
            <p className="text-muted mb-1 text-xs font-medium">{t("hour")}</p>
            <div className="grid grid-cols-6 gap-1">
              {hours.map((h) => {
                const real = h12 ? (h % 12) + (pm ? 12 : 0) : h;
                return (
                  <Cell key={h} on={hour === real} onClick={() => set(real, minute ?? 0)}>
                    {h12 ? h : pad(h)}
                  </Cell>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-muted mb-1 text-xs font-medium">{t("minute")}</p>
            <div className="grid grid-cols-6 gap-1">
              {MINUTES.map((m) => (
                <Cell
                  key={m}
                  on={minute === m}
                  onClick={() => {
                    set(hour ?? 8, m);
                    setOpen(false);
                  }}
                >
                  {pad(m)}
                </Cell>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

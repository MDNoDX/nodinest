"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { centuryOf, parseFlexDate } from "@/lib/dates";
import { DateParts } from "./date-parts";
import { Input } from "./input";

type Mode = "exact" | "approx" | "range" | "century";

function modeOf(v: string): Mode {
  const f = parseFlexDate(v);
  if (!f) return "exact";
  if (f.kind === "approx") return "approx";
  if (f.kind === "range") return centuryOf(f) ? "century" : "range";
  return "exact";
}

/**
 * Historical dates as people actually know them: an exact date / year,
 * "approximately 1150", "between 1100 and 1200" or "12th century".
 * Value is the stored text ("1499", "1150~", "1100/1200", "1101/1200").
 */
export function FlexDateInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("dates");
  const [mode, setMode] = useState<Mode>(() => modeOf(value));
  const f = parseFlexDate(value);
  const exact =
    f?.kind === "exact" || f?.kind === "approx"
      ? f.value
      : mode === "exact" || mode === "approx"
        ? value.replace(/~$/, "")
        : "";
  const [from, to] = f?.kind === "range" ? [f.from, f.to] : ["", ""];
  const century = f && f.kind === "range" ? centuryOf(f) : null;

  const switchTo = (m: Mode) => {
    setMode(m);
    const year = (f?.kind === "range" ? f.from : f?.kind ? f.value : "")
      .split("-")[0]
      .replace("~", "");
    if (!year) return onChange("");
    const y = Number(year);
    if (m === "exact") onChange(year);
    else if (m === "approx") onChange(`${year}~`);
    else if (m === "range") onChange(f?.kind === "range" ? `${f.from}/${f.to}` : `${year}/${year}`);
    else {
      const c = Math.floor((y - 1) / 100) + 1;
      onChange(`${(c - 1) * 100 + 1}/${c * 100}`);
    }
  };

  const modes: Mode[] = ["exact", "approx", "range", "century"];
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label={t("kind")}
        className="bg-surface-2 flex w-fit rounded-lg p-0.5 text-xs"
      >
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => switchTo(m)}
            className={cn(
              "rounded-md px-2 py-1 font-medium transition-colors",
              mode === m
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {t(m)}
          </button>
        ))}
      </div>
      {mode === "exact" || mode === "approx" ? (
        <div className="flex items-center gap-2">
          {mode === "approx" && <span className="text-muted text-sm">{t("approxPrefix")}</span>}
          <DateParts
            id={id}
            className="flex-1"
            value={exact}
            invalid={invalid}
            allowNegative
            yearPlaceholder={placeholder ?? "1499"}
            onChange={(v) => onChange(v ? (mode === "approx" ? `${v}~` : v) : "")}
          />
        </div>
      ) : mode === "range" ? (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
          <DateParts
            id={id}
            className="sm:flex-1"
            value={from}
            invalid={invalid}
            allowNegative
            yearPlaceholder="1100"
            onChange={(v) => onChange(v || to ? `${v}/${to}` : "")}
          />
          <span className="text-muted hidden sm:inline">–</span>
          <DateParts
            className="sm:flex-1"
            value={to}
            invalid={invalid}
            allowNegative
            yearPlaceholder="1200"
            onChange={(v) => onChange(from || v ? `${from}/${v}` : "")}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            min={1}
            max={21}
            className="w-24"
            aria-invalid={invalid || undefined}
            value={century ?? ""}
            placeholder="12"
            onChange={(e) => {
              const c = Number(e.target.value);
              onChange(c >= 1 && c <= 21 ? `${(c - 1) * 100 + 1}/${c * 100}` : "");
            }}
          />
          <span className="text-muted text-sm">{t("centurySuffix")}</span>
        </div>
      )}
    </div>
  );
}

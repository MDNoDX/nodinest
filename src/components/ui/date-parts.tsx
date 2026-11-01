"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Input } from "./input";

type Parts = { y: string; m: string; d: string };

const pad = (n: string) => n.padStart(2, "0");

function split(v: string): Parts {
  const neg = v.startsWith("-");
  const [y = "", m = "", d = ""] = (neg ? v.slice(1) : v).split("-");
  return { y: y ? (neg ? `-${y}` : y) : "", m, d };
}

function join(p: Parts): string {
  if (!/^-?\d{1,4}$/.test(p.y)) return "";
  if (!p.m) return p.y;
  return p.d ? `${p.y}-${p.m}-${p.d}` : `${p.y}-${p.m}`;
}

function daysIn(p: Parts) {
  const y = Math.abs(Number(p.y)) || 2000;
  return p.m ? new Date(Date.UTC(y, Number(p.m), 0)).getUTCDate() : 31;
}

/**
 * Year (required) + month and day (both optional) as three small controls,
 * so a date can be as precise as the user knows it: "2024", "2024-05" or
 * "2024-05-12". Works the same in every browser (no type="month").
 */
export function DateParts({
  id,
  value,
  onChange,
  invalid,
  yearPlaceholder = "2024",
  allowNegative,
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  yearPlaceholder?: string;
  allowNegative?: boolean;
  className?: string;
}) {
  const t = useTranslations("dates");
  // Local state keeps a month / day picked before the year is typed.
  const [p, setP] = useState<Parts>(() => split(value));
  const shown = join(p) === value ? p : value ? split(value) : p;
  const update = (next: Partial<Parts>) => {
    const n = { ...shown, ...next };
    if (!n.m) n.d = "";
    if (n.d && Number(n.d) > daysIn(n)) n.d = String(daysIn(n)).padStart(2, "0");
    setP(n);
    onChange(join(n));
  };

  return (
    <div className={cn("flex min-w-0 gap-1.5", className)}>
      <Input
        id={id}
        value={shown.y}
        inputMode="numeric"
        aria-label={t("year")}
        aria-invalid={invalid || undefined}
        placeholder={yearPlaceholder}
        className="w-[4.75rem] shrink-0 px-2 tabular-nums"
        maxLength={allowNegative ? 5 : 4}
        onChange={(e) => {
          const y = e.target.value.replace(allowNegative ? /[^\d-]/g : /\D/g, "");
          update({ y: y.replace(/(?!^)-/g, "") });
        }}
      />
      <Input
        aria-label={t("month")}
        value={shown.m ? String(Number(shown.m)) : ""}
        inputMode="numeric"
        placeholder={t("month")}
        maxLength={2}
        className="min-w-0 flex-1 px-2 tabular-nums"
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          update({ m: n >= 1 && n <= 12 ? pad(String(n)) : "" });
        }}
      />
      <Input
        aria-label={t("day")}
        value={shown.d ? String(Number(shown.d)) : ""}
        disabled={!shown.m}
        inputMode="numeric"
        placeholder={t("day")}
        maxLength={2}
        className="w-[4rem] shrink-0 px-2 tabular-nums"
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          // The month decides how far the day can go (30 in November, 28 or 29 in February).
          update({ d: n >= 1 ? pad(String(Math.min(n, daysIn(shown)))) : "" });
        }}
      />
    </div>
  );
}

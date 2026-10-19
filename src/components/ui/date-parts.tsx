"use client";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Input, Select } from "./input";

type Parts = { y: string; m: string; d: string };

// Spelled out: some browsers ship no Uzbek month names (they show "M10").
const MONTHS_UZ = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];
const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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
  const locale = useLocale();
  // Local state keeps a month / day picked before the year is typed.
  const [p, setP] = useState<Parts>(() => split(value));
  const shown = join(p) === value ? p : value ? split(value) : p;
  const months = locale === "uz" ? MONTHS_UZ : MONTHS_EN;
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
      <Select
        aria-label={t("month")}
        value={shown.m}
        className={cn("min-w-0 flex-1 px-2", !shown.m && "text-muted")}
        onChange={(e) => update({ m: e.target.value })}
      >
        <option value="">{t("month")}</option>
        {months.map((name, i) => (
          <option key={i} value={pad(String(i + 1))}>
            {name}
          </option>
        ))}
      </Select>
      <Select
        aria-label={t("day")}
        value={shown.d}
        disabled={!shown.m}
        className={cn("w-[4.5rem] shrink-0 px-2", !shown.d && "text-muted")}
        onChange={(e) => update({ d: e.target.value })}
      >
        <option value="">{t("day")}</option>
        {Array.from({ length: daysIn(shown) }, (_, i) => (
          <option key={i} value={pad(String(i + 1))}>
            {i + 1}
          </option>
        ))}
      </Select>
    </div>
  );
}

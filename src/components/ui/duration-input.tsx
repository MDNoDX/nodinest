"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input } from "./input";

type Parts = { m: string; s: string };

function split(total: string): Parts {
  const n = Number(total);
  if (!total || !Number.isFinite(n) || n <= 0) return { m: "", s: "" };
  return { m: String(Math.floor(n / 60)), s: n % 60 ? String(n % 60) : "" };
}

const join = (p: Parts) => {
  const total = (Number(p.m) || 0) * 60 + Math.min(59, Number(p.s) || 0);
  return total > 0 ? String(total) : "";
};

/**
 * A length as minutes + seconds (1 daq 52 son). `value` / `onChange` carry
 * total seconds as text ("" = unknown); `withSeconds={false}` for reading time.
 */
export function DurationInput({
  id,
  value,
  onChange,
  withSeconds = true,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (totalSeconds: string) => void;
  withSeconds?: boolean;
  invalid?: boolean;
}) {
  const t = useTranslations("duration");
  // Local state keeps "0" minutes or an empty field while typing.
  const [p, setP] = useState<Parts>(() => split(value));
  const shown = join(p) === value ? p : split(value);
  const update = (next: Partial<Parts>) => {
    const n = { ...shown, ...next };
    setP(n);
    onChange(join(n));
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        className="w-24"
        aria-label={t("minutes")}
        aria-invalid={invalid || undefined}
        value={shown.m}
        onChange={(e) => update({ m: e.target.value })}
      />
      <span className="text-muted text-sm">{t("min")}</span>
      {withSeconds && (
        <>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            className="w-20"
            aria-label={t("seconds")}
            aria-invalid={invalid || undefined}
            value={shown.s}
            onChange={(e) => update({ s: e.target.value })}
          />
          <span className="text-muted text-sm">{t("sec")}</span>
        </>
      )}
    </div>
  );
}

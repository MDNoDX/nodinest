"use client";
import { Minus, Plus, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover as P } from "radix-ui";
import { cn } from "@/lib/cn";
import { PAPER, setReaderPrefs, useReaderPrefs, type ReaderPrefs } from "./reader-prefs";

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { v: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-muted mb-1.5 text-xs font-medium">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="bg-surface-2 grid grid-flow-col gap-0.5 rounded-lg p-0.5"
      >
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            title={o.title}
            onClick={() => onChange(o.v)}
            className={cn(
              "flex h-8 items-center justify-center rounded-md px-2 text-sm",
              value === o.v
                ? "bg-surface text-foreground font-medium shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Aa": paper, typeface, size, line spacing and column width of the reader. */
export function ReaderSettings() {
  const t = useTranslations("reader");
  const p = useReaderPrefs();
  const set = (patch: Partial<ReaderPrefs>) => setReaderPrefs(patch);
  return (
    <P.Root>
      <P.Trigger asChild>
        <button
          type="button"
          className="text-muted hover:text-foreground hover:bg-surface-2 rounded-md p-1.5"
          aria-label={t("display")}
          title={t("display")}
        >
          <Type className="size-4" />
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content
          align="end"
          sideOffset={8}
          className="border-border bg-surface animate-scale-in z-50 flex w-72 flex-col gap-3.5 rounded-xl border p-4 shadow-xl"
        >
          <div>
            <p className="text-muted mb-1.5 text-xs font-medium">{t("paper")}</p>
            <div className="grid grid-cols-4 gap-2">
              {(["auto", "white", "sepia", "night"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={p.paper === k}
                  onClick={() => set({ paper: k })}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px]",
                    p.paper === k ? "border-primary ring-primary/30 ring-2" : "border-border",
                  )}
                >
                  <span
                    className="border-border grid size-8 place-items-center rounded-full border font-serif text-sm"
                    style={
                      k === "auto"
                        ? { background: "linear-gradient(135deg,#fff 50%,#121417 50%)" }
                        : { background: PAPER[k].bg, color: PAPER[k].fg }
                    }
                  >
                    {k === "auto" ? "" : "Aa"}
                  </span>
                  {t(`paper_${k}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-muted mb-1.5 text-xs font-medium">{t("size")}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set({ size: Math.max(14, p.size - 1) })}
                className="border-border hover:bg-surface-2 grid size-8 place-items-center rounded-lg border"
                aria-label={t("smaller")}
              >
                <Minus className="size-4" />
              </button>
              <span className="flex-1 text-center text-sm tabular-nums">{p.size}</span>
              <button
                type="button"
                onClick={() => set({ size: Math.min(28, p.size + 1) })}
                className="border-border hover:bg-surface-2 grid size-8 place-items-center rounded-lg border"
                aria-label={t("bigger")}
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
          <Choice
            label={t("typeface")}
            value={p.family}
            onChange={(v) => set({ family: v })}
            options={[
              { v: "serif", label: <span className="font-serif">{t("serif")}</span> },
              { v: "sans", label: <span className="font-sans">{t("sans")}</span> },
            ]}
          />
          <Choice
            label={t("leading")}
            value={p.leading}
            onChange={(v) => set({ leading: v })}
            options={[
              { v: 1.5, label: "1,5" },
              { v: 1.75, label: "1,75" },
              { v: 2, label: "2" },
            ]}
          />
          <Choice
            label={t("width")}
            value={p.width}
            onChange={(v) => set({ width: v })}
            options={[
              { v: "narrow", label: t("width_narrow") },
              { v: "normal", label: t("width_normal") },
              { v: "wide", label: t("width_wide") },
            ]}
          />
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

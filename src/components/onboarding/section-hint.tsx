"use client";
import { Lightbulb, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Not an "nn:" key: sign-out clears those, and a closed hint should stay closed. */
const keyOf = (s: string) => `nodinest-hint-${s}`;

/** One short sentence the first time a section is opened; closed for good by ×. */
export function SectionHint({ section }: { section: string }) {
  const t = useTranslations("sectionHint");
  const known = t.has(section as "library");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!known) return;
    try {
      if (!localStorage.getItem(keyOf(section))) queueMicrotask(() => setOpen(true));
    } catch {
      /* no storage: no hint */
    }
  }, [known, section]);
  if (!open) return null;
  return (
    <div className="bg-primary-soft/60 animate-fade-in -mt-3 mb-6 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm">
      <Lightbulb className="text-primary mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1">{t(section as "library")}</p>
      <button
        type="button"
        aria-label={t("close")}
        className="text-muted hover:text-foreground"
        onClick={() => {
          setOpen(false);
          try {
            localStorage.setItem(keyOf(section), "1");
          } catch {
            /* it just shows again */
          }
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

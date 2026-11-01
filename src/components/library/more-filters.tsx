"use client";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** Phones: the filters stay folded under one button; wide screens show them all. */
export function MoreFilters({ active, children }: { active: boolean; children: React.ReactNode }) {
  const t = useTranslations("library");
  const [open, setOpen] = useState(active);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-muted hover:text-foreground flex items-center gap-1.5 justify-self-start text-sm font-medium lg:hidden"
      >
        <SlidersHorizontal className="size-4" /> {t("filters")}
      </button>
      <div className={cn("contents", !open && "max-lg:hidden")}>{children}</div>
    </>
  );
}

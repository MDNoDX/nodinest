"use client";
import { Heading2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { Chapter } from "./taqriz-store";

/** The taqriz's chapters (headings) as a clickable outline. */
export function Outline({
  chapters,
  activePos,
  onGo,
  onAdd,
}: {
  chapters: Chapter[];
  activePos: number | null;
  onGo: (pos: number) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("taqriz");
  return (
    <nav aria-label={t("contents")} className="flex flex-col">
      {chapters.length === 0 ? (
        <p className="text-muted px-3 py-2 text-xs leading-relaxed">{t("noChapters")}</p>
      ) : (
        <ol className="flex flex-col">
          {chapters.map((c, i) => {
            const on = c.pos === activePos;
            return (
              <li key={`${c.pos}-${i}`}>
                <button
                  type="button"
                  onClick={() => onGo(c.pos)}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "relative flex w-full items-baseline gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors",
                    c.level === 3 ? "pl-8 text-[13px]" : "pl-4",
                    on
                      ? "text-primary bg-primary-soft font-semibold"
                      : "text-foreground/80 hover:bg-surface-2",
                  )}
                >
                  {on && (
                    <span
                      aria-hidden
                      className="bg-primary absolute top-1.5 bottom-1.5 left-1 w-[3px] rounded-full"
                    />
                  )}
                  <span className="line-clamp-2">{c.text}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="text-primary hover:bg-primary-soft mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium"
      >
        <Heading2 className="size-4" /> {t("addChapter")}
      </button>
    </nav>
  );
}

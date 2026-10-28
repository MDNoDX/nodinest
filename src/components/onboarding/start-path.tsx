"use client";
import { ArrowRight, Check, LifeBuoy, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import type { StartSteps } from "@/server/onboarding";

const KEY = "nodinest-start-hidden";
const noSubscribe = () => () => {};
const readHidden = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** The home page's checklist for a new user (gone when done or dismissed). */
export function StartPath({ steps }: { steps: StartSteps }) {
  const t = useTranslations("start");
  const stored = useSyncExternalStore(noSubscribe, readHidden, () => true);
  const [closed, setClosed] = useState(false);
  const list = [
    { k: "added", done: steps.added, href: "/library/new" },
    { k: "pdf", done: steps.pdf, href: "/library" },
    { k: "reading", done: steps.reading, href: "/library" },
    { k: "marked", done: steps.marked, href: "/guide#reading" },
    { k: "questions", done: steps.questions, href: "/review" },
  ] as const;
  const done = list.filter((s) => s.done).length;
  if (stored || closed || done === list.length) return null;
  const next = list.find((s) => !s.done);
  return (
    <section className="card relative overflow-hidden p-5" aria-labelledby="start-title">
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* ignore */
          }
          setClosed(true);
        }}
        className="text-muted hover:text-foreground absolute top-3 right-3 rounded-md p-1"
        aria-label={t("hide")}
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-3">
        <h2 id="start-title" className="font-semibold">
          {t("title")}
        </h2>
        <span className="text-muted text-xs tabular-nums">
          {done} / {list.length}
        </span>
      </div>
      <div className="bg-surface-2 mt-2 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${(done / list.length) * 100}%` }}
        />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {list.map((s, i) => (
          <li key={s.k} className={cn(s.done && "max-sm:hidden")}>
            <Link
              href={s.href}
              className={cn(
                "flex h-full gap-x-3 gap-y-1 rounded-xl border p-3 text-sm transition-colors max-sm:grid max-sm:grid-cols-[auto_1fr] sm:flex-col",
                s.done
                  ? "border-transparent bg-[var(--c-emerald)]/10"
                  : s === next
                    ? "border-primary bg-primary-soft/40"
                    : "border-border hover:bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-bold",
                  s.done ? "bg-[var(--c-emerald)] text-white" : "bg-surface-2 text-muted",
                )}
              >
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("font-medium", s.done && "text-muted line-through")}>
                {t(`${s.k}.title`)}
              </span>
              {!s.done && (
                <span className="text-muted text-xs leading-snug max-sm:col-start-2">
                  {t(`${s.k}.hint`)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>
      <Link
        href="/guide"
        className="text-primary mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline"
      >
        <LifeBuoy className="size-4" /> {t("guide")} <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}

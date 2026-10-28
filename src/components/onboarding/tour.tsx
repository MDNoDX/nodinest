"use client";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LogoSymbol } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Not an "nn:" key: sign-out clears those, and the tour should not come back. */
const DONE_KEY = "nodinest-tour-v1";
export const TOUR_EVENT = "nodinest:tour";

type Step = { id: string; target?: string };
const STEPS: Step[] = [
  { id: "welcome" },
  { id: "add", target: "add" },
  { id: "library", target: "nav-library" },
  { id: "read" },
  { id: "notes", target: "nav-notes" },
  { id: "review", target: "nav-review" },
  { id: "assistant", target: "nav-assistant" },
  { id: "write", target: "nav-write" },
  { id: "guide", target: "nav-settings" },
];

/** First visible element with data-tour=name (the phone menu has a copy). */
function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  return findOne(name) ?? (name.startsWith("nav-") ? findOne("nav-more") : null);
}

/** On phones a section may sit behind the bottom bar's "Menu": that is lit then. */
function findOne(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && !el.closest("[hidden]")) return el;
  }
  return null;
}

/**
 * First-visit guide: dims the page, lights up one button at a time with a
 * pulsing ring and says what it does. Can be skipped and replayed from
 * Settings. `aiLimit` = daily AI requests for this account (null = no limit).
 */
export function OnboardingTour({ aiLimit }: { aiLimit: number | null }) {
  const t = useTranslations("tour");
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(DONE_KEY) === "1";
    } catch {
      /* storage unavailable: don't nag */
    }
    const start = () => setI(0);
    const timer = seen ? null : setTimeout(start, 900);
    window.addEventListener(TOUR_EVENT, start);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(TOUR_EVENT, start);
    };
  }, []);

  const finish = useCallback(() => {
    setI(null);
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const step = i == null ? null : STEPS[i];
  // Follow the target (layout shifts, scrolling, resizing).
  useLayoutEffect(() => {
    if (!step) return;
    const el = findTarget(step.target);
    el?.scrollIntoView({ block: "nearest" });
    const measure = () => setRect(findTarget(step.target)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    if (i == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight")
        setI((n) => (n == null || n >= STEPS.length - 1 ? n : n + 1));
      else if (e.key === "ArrowLeft") setI((n) => (n ? n - 1 : n));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, finish]);

  if (i == null || !step) return null;
  const last = i === STEPS.length - 1;
  const pad = 6;
  const hole = rect && {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  // Card next to the lit element: right of it when there is room, else below / above.
  const W = 320;
  let card: React.CSSProperties = {
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  };
  if (hole) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (hole.left + hole.width + 16 + W < vw)
      card = {
        left: hole.left + hole.width + 16,
        top: Math.min(Math.max(12, hole.top - 8), vh - 260),
      };
    else if (hole.top + hole.height + 230 < vh)
      card = {
        left: Math.min(Math.max(12, hole.left), vw - W - 12),
        top: hole.top + hole.height + 14,
      };
    else
      card = {
        left: Math.min(Math.max(12, hole.left), vw - W - 12),
        top: Math.max(12, hole.top - 240),
      };
  }

  const body =
    step.id === "assistant"
      ? t("assistantBody", {
          limit: aiLimit == null ? t("unlimited") : t("limitN", { n: aiLimit }),
        })
      : t(`${step.id}Body` as "welcomeBody");

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("label")}>
      {/* Dim everything except the lit element (a huge shadow around a hole). */}
      {hole ? (
        <div
          className="pointer-events-none absolute rounded-xl transition-all duration-300 ease-out"
          style={{ ...hole, boxShadow: "0 0 0 9999px rgb(8 12 30 / 0.62)" }}
        >
          <span className="tour-ring absolute inset-0 rounded-xl" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[rgb(8_12_30/0.62)]" />
      )}
      <div
        key={step.id}
        className="border-border bg-surface animate-scale-in absolute w-[min(320px,calc(100vw-24px))] rounded-2xl border p-4 shadow-2xl"
        style={card}
      >
        <div className="mb-2 flex items-center gap-2">
          {step.id === "welcome" ? (
            <LogoSymbol className="size-8" />
          ) : (
            <span className="bg-primary-soft text-primary grid size-7 place-items-center rounded-lg">
              <Sparkles className="size-4" />
            </span>
          )}
          <h2 className="font-semibold">{t(`${step.id}Title` as "welcomeTitle")}</h2>
          <button
            type="button"
            onClick={finish}
            className="text-muted hover:text-foreground ml-auto rounded p-1"
            aria-label={t("skip")}
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="text-muted text-sm leading-relaxed">{body}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((s, n) => (
              <span
                key={s.id}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  n === i ? "bg-primary w-4" : "bg-border-strong w-1.5",
                )}
              />
            ))}
          </div>
          <div className="ml-auto flex gap-1.5">
            {i > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setI(i - 1)} aria-label={t("back")}>
                <ArrowLeft />
              </Button>
            )}
            {last && (
              <Button size="sm" variant="outline" asChild>
                <Link href="/guide" onClick={finish}>
                  {t("openGuide")}
                </Link>
              </Button>
            )}
            <Button size="sm" onClick={() => (last ? finish() : setI(i + 1))}>
              {last ? t("done") : i === 0 ? t("start") : t("next")}
              {!last && <ArrowRight />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

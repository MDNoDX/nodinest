"use client";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookOpenText,
  Brain,
  CalendarCheck,
  LifeBuoy,
  PenLine,
  Plus,
  Quote,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LogoSymbol } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/** Not an "nn:" key: sign-out clears those, and the tour should not come back. */
const DONE_KEY = "nodinest-tour-v1";
export const TOUR_EVENT = "nodinest:tour";

type Step = { id: string; target?: string };
const STEPS: Step[] = [
  { id: "welcome" },
  { id: "plans", target: "nav-plans" },
  { id: "add", target: "add" },
  { id: "library", target: "nav-library" },
  { id: "read" },
  { id: "notes", target: "nav-library" },
  { id: "review", target: "nav-library" },
  { id: "assistant", target: "nav-assistant" },
  { id: "write", target: "nav-write" },
  { id: "guide", target: "nav-settings" },
];

const ICONS: Record<string, LucideIcon> = {
  plans: CalendarCheck,
  add: Plus,
  library: BookOpen,
  read: BookOpenText,
  notes: Quote,
  review: Brain,
  assistant: Sparkles,
  write: PenLine,
  guide: LifeBuoy,
};

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
  const W = Math.min(340, window.innerWidth - 24);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let card: React.CSSProperties = { left: (vw - W) / 2, top: Math.max(12, vh / 2 - 130) };
  if (hole) {
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

  const Icon = ICONS[step.id] ?? Sparkles;
  const body =
    step.id === "assistant"
      ? t("assistantBody", {
          limit: aiLimit == null ? t("unlimited") : t("limitN", { n: aiLimit }),
        })
      : t(`${step.id}Body` as "welcomeBody");

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("label")}>
      {/* Dim everything except the lit element: the hole glides from one to the next. */}
      <div
        className="tour-hole pointer-events-none absolute rounded-xl"
        style={hole ?? { left: vw / 2, top: vh / 2, width: 0, height: 0 }}
      >
        {hole && <span className="tour-ring absolute inset-0 rounded-xl" />}
      </div>
      <div
        className="tour-card border-border bg-surface absolute overflow-hidden rounded-2xl border shadow-2xl"
        style={{ ...card, width: W }}
      >
        <span
          aria-hidden
          className="tour-progress absolute inset-x-0 top-0 h-1"
          style={{ transform: `scaleX(${(i + 1) / STEPS.length})` }}
        />
        <div key={step.id} className="tour-text p-4 pt-5">
          <div className="mb-2 flex items-center gap-2">
            {step.id === "welcome" ? (
              <LogoSymbol className="size-8" />
            ) : (
              <span className="bg-primary-soft text-primary grid size-8 place-items-center rounded-lg">
                <Icon className="size-[18px]" />
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
            <span className="text-muted text-xs tabular-nums">
              {i + 1} / {STEPS.length}
            </span>
            <div className="ml-auto flex gap-1.5">
              {i > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setI(i - 1)}
                  aria-label={t("back")}
                >
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
      </div>
    </div>,
    document.body,
  );
}

"use client";
import {
  ArrowRight,
  BadgeCheck,
  Send,
  UsersRound,
  BookOpen,
  Brain,
  Feather,
  Headphones,
  HelpCircle,
  Layers,
  Library,
  Lightbulb,
  Notebook,
  PenLine,
  PlayCircle,
  Rocket,
  Search,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { TOUR_EVENT } from "@/components/onboarding/tour";
import { Button } from "@/components/ui/button";
import type { GuideSection } from "@/content/guide";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket,
  library: Library,
  "book-open": BookOpen,
  headphones: Headphones,
  "pen-line": PenLine,
  feather: Feather,
  notebook: Notebook,
  brain: Brain,
  sparkles: Sparkles,
  layers: Layers,
  shield: Shield,
  help: HelpCircle,
  users: UsersRound,
  badge: BadgeCheck,
  send: Send,
};

const fold = (s: string) => s.toLocaleLowerCase().replace(/[‘’ʻʼ`']/g, "'");

/** The guide: an index on the side, every section as a card, and a search. */
export function GuideView({ sections }: { sections: GuideSection[] }) {
  const t = useTranslations("guide");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const k = fold(q.trim());
    if (k.length < 2) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => fold(`${i.title} ${i.text} ${i.tip ?? ""}`).includes(k)),
      }))
      .filter((s) => s.items.length || fold(s.title).includes(k));
  }, [q, sections]);

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
      <nav aria-label={t("contents")} className="hidden lg:block">
        <div className="sticky top-20 flex flex-col gap-0.5">
          {sections.map((s) => {
            const Icon = ICONS[s.icon] ?? HelpCircle;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-muted hover:text-foreground hover:bg-surface-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
              >
                <Icon className="size-4" /> {s.title}
              </a>
            );
          })}
        </div>
      </nav>
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="border-border-strong bg-surface h-11 w-full rounded-xl border pr-3 pl-9 text-sm"
            />
          </div>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}
          >
            <PlayCircle /> {t("replay")}
          </Button>
        </div>
        {!shown.length && <p className="text-muted text-sm">{t("nothing")}</p>}
        {shown.map((s) => {
          const Icon = ICONS[s.icon] ?? HelpCircle;
          return (
            <section key={s.id} id={s.id} className="card scroll-mt-20 p-5 sm:p-6">
              <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
                <span className="bg-primary-soft text-primary grid size-9 place-items-center rounded-xl">
                  <Icon className="size-5" />
                </span>
                {s.title}
              </h2>
              {s.intro && <p className="text-muted mt-2 leading-relaxed">{s.intro}</p>}
              <dl className="mt-4 flex flex-col gap-4">
                {s.items.map((i) => (
                  <div key={i.title}>
                    <dt className="font-semibold">{i.title}</dt>
                    <dd className="text-foreground/85 mt-1 leading-relaxed">{i.text}</dd>
                    {i.tip && (
                      <dd
                        className={cn(
                          "mt-2 flex gap-2 rounded-lg p-3 text-sm",
                          "text-foreground/90 bg-[var(--c-amber)]/10",
                        )}
                      >
                        <Lightbulb className="mt-0.5 size-4 text-[var(--c-amber)]" /> {i.tip}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
              {s.link && (
                <Link
                  href={s.link.href}
                  className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                >
                  {s.link.label} <ArrowRight className="size-4" />
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

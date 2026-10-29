import { CalendarDays, Flag, ListChecks, TrendingUp } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DayView } from "@/components/roznoma/day-view";
import { GoalsView } from "@/components/roznoma/goals-view";
import { RoutinesView } from "@/components/roznoma/routines-view";
import { StatsView } from "@/components/roznoma/stats-view";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { addDays } from "@/lib/dates";
import { fmtDay } from "@/lib/format";
import { pageContext, sp, type SP } from "@/lib/page";
import { listGoalsWithProgress } from "@/server/goals";
import { getDay, history, listRoutines } from "@/server/roznoma";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("nav"))("plans") };
}

const TABS = [
  ["day", CalendarDays],
  ["goals", Flag],
  ["plans", ListChecks],
  ["stats", TrendingUp],
] as const;
type Tab = (typeof TABS)[number][0];

/**
 * Röznoma: the day (plan with ticks + the day's page), goals and what they
 * consist of, the repeating plan, and the numbers.
 */
export default async function RoznomaPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, tz, today, locale } = await pageContext();
  const t = await getTranslations();
  const q = await searchParams;
  const asked = sp(q.tab);
  const tab: Tab = TABS.some(([k]) => k === asked) ? (asked as Tab) : "day";
  const qd = sp(q.day);
  const day = qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : today;

  let body: React.ReactNode = null;
  if (tab === "day") {
    const d = await getDay(ctx, day, locale);
    const wd = fmtDay(day, locale, { weekday: "long" });
    const date = `${fmtDay(day, locale, { day: "numeric", month: "long", year: "numeric" }).replace(",", "")} | ${wd.charAt(0).toUpperCase()}${wd.slice(1)}`;

    body = (
      <DayView
        key={day}
        day={day}
        isToday={day === today}
        dateLabel={date}
        hijri={d.hijri}
        prevHref={`/plans?day=${addDays(day, -1)}`}
        nextHref={`/plans?day=${addDays(day, 1)}`}
        initialItems={d.items}
        log={d.log}
        motto={d.motto}
      />
    );
  } else if (tab === "goals") {
    const goals = await listGoalsWithProgress(db, ctx, today, tz);
    body = (
      <GoalsView
        goals={goals.map((g) => ({
          id: g.id,
          title: g.title,
          note: g.note,
          metric: g.metric,
          status: g.status,
          value: g.value,
          target: g.target,
          steps: g.steps,
          periodLabel: `${t(`plans.periods.${g.period}`)} · ${t("plans.progress", { value: g.value, target: g.target })}`,
        }))}
      />
    );
  } else if (tab === "plans") {
    body = <RoutinesView routines={await listRoutines(ctx)} today={today} />;
  } else {
    body = <StatsView h={await history(ctx, today, 30)} locale={locale} />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader section="plans" title={t("nav.plans")} subtitle={t("roznoma.subtitle")} />
      <nav className="bg-surface-2 mb-5 grid grid-cols-4 gap-0.5 rounded-xl p-0.5 text-sm">
        {TABS.map(([k, Icon]) => (
          <Link
            key={k}
            href={`/plans?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 font-medium",
              tab === k
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 max-sm:hidden" /> {t(`roznoma.tab_${k}`)}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}

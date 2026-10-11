import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BarChart } from "@/components/charts/bar-chart";
import { HBarList } from "@/components/charts/hbar-list";
import { Card, CardHeader, EmptyState, PageHeader, StatTile } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { addDays } from "@/lib/dates";
import { fmtDay, fmtMinutes } from "@/lib/format";
import { pageContext, sp, type SP } from "@/lib/page";
import { RESOURCE_TYPES } from "@/lib/validation";
import { getStats } from "@/server/stats";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("stats"))("title") };
}

const RANGES = ["7", "30", "90", "365"] as const;

export default async function StatsPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, locale, tz, today } = await pageContext();
  const t = await getTranslations();
  const p = await searchParams;
  const range = (RANGES as readonly string[]).includes(sp(p.range) ?? "") ? sp(p.range)! : "30";
  const type = (RESOURCE_TYPES as readonly string[]).includes(sp(p.type) ?? "")
    ? sp(p.type)!
    : null;
  const days = Number(range);
  const from = addDays(today, -(days - 1));
  const s = await getStats(db, ctx, {
    timeZone: tz,
    today,
    range: { from, to: today },
    resourceType: type,
  });
  const total = s.daily.reduce((a, d) => a + d.seconds, 0);
  const sessions = s.daily.reduce((a, d) => a + d.sessions, 0);
  const activeDays = s.daily.filter((d) => d.seconds > 0).length;
  const fm = (v: number) => fmtMinutes(v, locale);

  // Daily series (bucket by week for the 12-month range to stay readable).
  const map = new Map(s.daily.map((d) => [d.day, d.seconds]));
  const daily =
    days <= 90
      ? Array.from({ length: days }, (_, i) => {
          const d = addDays(from, i);
          const v = map.get(d) ?? 0;
          return {
            label: fmtDay(d, locale, { weekday: "short", day: "numeric", month: "short" }),
            short: fmtDay(d, locale, { day: "numeric" }),
            value: v,
            display: fm(v),
          };
        })
      : s.monthly.map((m) => ({
          label: fmtDay(`${m.month}-01`, locale, { month: "long", year: "numeric" }),
          short: fmtDay(`${m.month}-01`, locale, { month: "short" }),
          value: m.seconds,
          display: fm(m.seconds),
        }));
  const weeklyMap = new Map(s.weekly.map((w) => [w.week, w.seconds]));
  const weekStart = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const w = addDays(weekStart, -7 * (11 - i));
    const v = weeklyMap.get(w) ?? 0;
    return {
      label: fmtDay(w, locale, { day: "numeric", month: "long" }),
      short: fmtDay(w, locale, { day: "numeric", month: "short" }),
      value: v,
      display: fm(v),
    };
  });
  const hours = Array.from({ length: 24 }, (_, h) => {
    const v = s.hourOfDay.find((x) => x.hour === h)?.seconds ?? 0;
    return {
      label: `${String(h).padStart(2, "0")}:00`,
      short: h % 3 === 0 ? String(h) : "",
      value: v,
      display: fm(v),
    };
  });
  const qs = (o: Record<string, string | null>) => {
    const u = new URLSearchParams({ range, ...(type ? { type } : {}) });
    for (const [k, v] of Object.entries(o)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    return `/stats?${u}`;
  };

  return (
    <>
      <PageHeader section="stats" title={t("stats.title")} subtitle={t("stats.subtitle")} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <nav className="bg-surface-2 inline-flex rounded-lg p-1" aria-label={t("stats.range")}>
          {RANGES.map((r) => (
            <Link
              key={r}
              href={qs({ range: r })}
              aria-current={range === r ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                range === r ? "bg-surface shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              {t(`stats.ranges.${r}`)}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-1" aria-label={t("common.type")}>
          <Link
            href={qs({ type: null })}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              !type ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted",
            )}
          >
            {t("library.allTypes")}
          </Link>
          {RESOURCE_TYPES.map((r) => (
            <Link
              key={r}
              href={qs({ type: r })}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                type === r ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted",
              )}
            >
              {t(`types.plural.${r}`)}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t("stats.totalTime")}
          value={fm(total)}
          hint={`${t("stats.allTime")}: ${fm(s.totals.all_time)}`}
        />
        <StatTile label={t("stats.sessions")} value={sessions} />
        <StatTile
          label={t("stats.activeDays")}
          value={activeDays}
          hint={`${t("dashboard.streak")}: ${t("dashboard.streakDays", { count: s.streaks.current })}`}
        />
        <StatTile
          label={t("stats.avgPerDay")}
          value={fm(activeDays ? Math.round(total / activeDays) : 0)}
          hint={`${t("stats.completedInRange")}: ${s.records.completed_in_range}`}
        />
      </div>

      {total === 0 ? (
        <EmptyState
          className="mt-6"
          title={t("stats.noData")}
          action={
            <Link href="/journal" className="text-primary text-sm font-medium hover:underline">
              {t("dashboard.startSession")}
            </Link>
          }
        />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader title={days <= 90 ? t("stats.daily") : t("stats.monthly")} />
            <div className="px-5 pb-5">
              <BarChart
                data={daily}
                ariaLabel={days <= 90 ? t("stats.daily") : t("stats.monthly")}
                height={180}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("stats.byType")} />
            <div className="px-5 pb-5">
              <HBarList
                items={s.byType.map((x) => ({
                  key: x.type ?? "none",
                  label: x.type ? t(`types.${x.type}`) : t("stats.unlinked"),
                  value: x.seconds,
                }))}
                formatValue={fm}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("stats.byTopic")} />
            <div className="px-5 pb-5">
              <HBarList
                items={s.byCategory.map((c) => ({
                  key: c.id,
                  label: locale === "uz" ? c.name_uz : c.name_en,
                  value: c.seconds,
                  href: `/library?category=${c.id}`,
                }))}
                formatValue={fm}
                emptyLabel={t("empty.nothingHere")}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("stats.topResources")} />
            <div className="px-5 pb-5">
              <HBarList
                items={s.topResources.map((r) => ({
                  key: r.id,
                  label: r.title,
                  value: r.seconds,
                  href: `/library/${r.id}`,
                }))}
                formatValue={fm}
                emptyLabel={t("empty.nothingHere")}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("stats.timeOfDay")} />
            <div className="px-5 pb-5">
              <BarChart data={hours} ariaLabel={t("stats.timeOfDay")} height={140} />
            </div>
          </Card>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("stats.weekly")} />
          <div className="px-5 pb-5">
            <BarChart data={weekly} ariaLabel={t("stats.weekly")} height={150} highlightLast />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("stats.shelf")} />
          <div className="px-5 pb-5">
            <HBarList
              items={(["planned", "in_progress", "completed", "paused", "abandoned"] as const).map(
                (k) => ({
                  key: k,
                  label: t(`status.${k}`),
                  value: s.records[k],
                  href: `/library?status=${k}`,
                }),
              )}
              formatValue={(v) => String(v)}
            />
          </div>
        </Card>
      </div>
    </>
  );
}

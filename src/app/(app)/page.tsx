import { desc, isNull } from "drizzle-orm";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  History,
  Library,
  Plus,
  Quote,
  Tags,
  Target,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BarChart } from "@/components/charts/bar-chart";
import { HBarList, ProgressBar } from "@/components/charts/hbar-list";
import { StartSessionButton } from "@/components/journal/start-session-button";
import { Cover, coverSrc } from "@/components/library/cover";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatTile } from "@/components/ui/misc";
import { withUser } from "@/db";
import { resources } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { fmtDay, fmtMinutes } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { listGoalsWithProgress, listPlans } from "@/server/goals";
import { listMyRecords } from "@/server/journal";
import { listNotes } from "@/server/notes";
import { getStats } from "@/server/stats";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, ctx, db, locale, tz, today } = await pageContext();
  const t = await getTranslations();
  const [records, plans, notes, stats, goals, recentCatalog] = await Promise.all([
    listMyRecords(db, ctx),
    listPlans(db, ctx),
    listNotes(db, ctx, {}),
    getStats(db, ctx, { timeZone: tz, today, range: { from: addDays(today, -89), to: today } }),
    listGoalsWithProgress(db, ctx, today, tz),
    withUser(db, ctx, (tx) =>
      tx
        .select({
          id: resources.id,
          title: resources.title,
          type: resources.type,
          coverUrl: resources.coverUrl,
          coverFileId: resources.coverFileId,
        })
        .from(resources)
        .where(isNull(resources.deletedAt))
        .orderBy(desc(resources.createdAt))
        .limit(6),
    ),
  ]);

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(
      new Date(),
    ),
  );
  const greetingKey =
    hour < 12 ? "greetingMorning" : hour < 18 ? "greetingAfternoon" : "greetingEvening";
  const firstName = user.name.split(" ")[0];
  const inProgress = records.filter((r) => r.status === "in_progress").slice(0, 4);
  const recent = records.filter((r) => r.lastAccessedAt).slice(0, 5);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const dailyMap = new Map(stats.daily.map((d) => [d.day, d.seconds]));
  const week = last7.map((d) => ({
    label: fmtDay(d, locale, { weekday: "long", day: "numeric", month: "short" }),
    short: fmtDay(d, locale, { weekday: "short" }),
    value: dailyMap.get(d) ?? 0,
    display: fmtMinutes(dailyMap.get(d) ?? 0, locale),
  }));
  const delta = stats.totals.week - stats.totals.prev_week;
  const activeGoals = goals.filter((g) => g.status === "active").slice(0, 4);
  const isEmpty = records.length === 0 && stats.totals.all_time === 0 && notes.total === 0;

  return (
    <>
      <PageHeader
        section="dashboard"
        title={t(`dashboard.${greetingKey}`, { name: firstName })}
        subtitle={t("dashboard.subtitle")}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/notes/new">
                <Quote /> {t("nav.newNote")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/library/new">
                <Plus /> {t("nav.newResource")}
              </Link>
            </Button>
          </>
        }
      />

      {isEmpty && (
        <EmptyState
          className="mb-8"
          icon={<BookOpen />}
          title={t("dashboard.emptyTitle")}
          body={t("dashboard.emptyBody")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/library/new">
                  <Plus /> {t("nav.newResource")}
                </Link>
              </Button>
              <StartSessionButton label={t("dashboard.startSession")} variant="outline" />
            </div>
          }
        />
      )}

      <section aria-label={t("stats.title")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Clock />}
          hue="blue"
          label={t("dashboard.thisWeek")}
          value={fmtMinutes(stats.totals.week, locale)}
          hint={
            stats.totals.prev_week || stats.totals.week
              ? t("dashboard.vsLastWeek", {
                  delta: `${delta >= 0 ? "+" : "−"}${fmtMinutes(Math.abs(delta), locale)}`,
                })
              : undefined
          }
        />
        <StatTile
          icon={<CalendarDays />}
          hue="violet"
          label={t("dashboard.thisMonth")}
          value={fmtMinutes(stats.totals.month, locale)}
        />
        <StatTile
          icon={<Flame />}
          hue="orange"
          label={t("dashboard.streak")}
          value={t("dashboard.streakDays", { count: stats.streaks.current })}
          hint={
            stats.streaks.longest
              ? t("dashboard.longest", { count: stats.streaks.longest })
              : undefined
          }
        />
        <StatTile
          icon={<CheckCircle2 />}
          hue="emerald"
          label={t("dashboard.completed")}
          value={stats.records.completed}
          hint={`${t("status.in_progress")}: ${stats.records.in_progress}`}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={t("dashboard.currently")}
              icon={<BookOpen />}
              hue="indigo"
              action={
                <Link
                  href="/library?status=in_progress"
                  className="text-primary text-xs font-medium hover:underline"
                >
                  {t("common.seeAll")}
                </Link>
              }
            />
            <div className="px-5 pb-5">
              {inProgress.length === 0 ? (
                <p className="text-muted text-sm">{t("dashboard.noActive")}</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {inProgress.map((r) => (
                    <li key={r.id} className="border-border flex gap-3 rounded-lg border p-3">
                      <Cover type={r.type} title={r.title} src={coverSrc(r)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/library/${r.resourceId}`}
                          className="line-clamp-2 text-sm font-medium hover:underline"
                        >
                          {r.title}
                        </Link>
                        <div className="text-muted mt-1 text-xs">
                          {t(`types.${r.type}`)} · {fmtMinutes(r.totalSeconds, locale)}
                        </div>
                        {r.progressTotal ? (
                          <div className="mt-2">
                            <ProgressBar
                              value={r.progressCurrent ?? 0}
                              max={r.progressTotal}
                              label={t("record.progress")}
                            />
                            <div className="text-muted mt-1 text-[11px] tabular-nums">
                              {r.progressCurrent ?? 0} / {r.progressTotal}{" "}
                              {t(`progressUnits.${r.progressUnit}`)}
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-2">
                          <StartSessionButton
                            resourceId={r.resourceId}
                            label={t("resource.startSession")}
                            size="sm"
                            variant="secondary"
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("dashboard.weekChart")}
              icon={<BarChart3 />}
              hue="blue"
              action={
                <Link
                  href="/stats"
                  className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                >
                  {t("dashboard.openStats")} <ArrowRight className="size-3" />
                </Link>
              }
            />
            <div className="px-5 pb-5">
              <BarChart data={week} ariaLabel={t("dashboard.weekChart")} highlightLast />
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("dashboard.recentNotes")}
              icon={<Quote />}
              hue="violet"
              action={
                <Link href="/notes" className="text-primary text-xs font-medium hover:underline">
                  {t("common.seeAll")}
                </Link>
              }
            />
            <div className="px-5 pb-5">
              {notes.items.length === 0 ? (
                <p className="text-muted text-sm">{t("dashboard.noNotes")}</p>
              ) : (
                <ul className="divide-border divide-y">
                  {notes.items.slice(0, 5).map((n) => (
                    <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                      <Link
                        href={`/notes/${n.id}`}
                        className="hover:bg-surface-2/60 block rounded-md"
                      >
                        {n.kind === "quote" ? (
                          <blockquote className="border-accent line-clamp-2 border-l-2 pl-3 font-serif text-[15px] italic">
                            “{n.quoteText}”
                          </blockquote>
                        ) : (
                          <div className="line-clamp-2 text-sm">
                            {n.title && <span className="font-medium">{n.title} — </span>}
                            <span className="text-muted">{n.body}</span>
                          </div>
                        )}
                        {n.resourceTitle && (
                          <div className="text-muted mt-1 text-xs">
                            {t("notes.fromResource", { title: n.resourceTitle })}
                          </div>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title={t("dashboard.goals")}
              icon={<Target />}
              hue="emerald"
              action={
                <Link href="/plans" className="text-primary text-xs font-medium hover:underline">
                  {activeGoals.length ? t("common.seeAll") : t("dashboard.addGoal")}
                </Link>
              }
            />
            <div className="flex flex-col gap-4 px-5 pb-5">
              {activeGoals.length === 0 && (
                <p className="text-muted text-sm">{t("dashboard.noGoals")}</p>
              )}
              {activeGoals.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{g.title}</span>
                    <span className="text-muted shrink-0 text-xs tabular-nums">
                      {t("plans.progress", { value: g.value, target: g.target })}
                    </span>
                  </div>
                  <ProgressBar value={g.value} max={g.target} label={g.title} />
                  <div className="text-muted mt-1 text-[11px]">
                    {t(`plans.periods.${g.period}`)} · {t(`plans.metrics.${g.metric}`)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("dashboard.planned")}
              icon={<CalendarCheck />}
              hue="teal"
              action={
                <Link href="/plans" className="text-primary text-xs font-medium hover:underline">
                  {t("common.seeAll")}
                </Link>
              }
            />
            <ul className="flex flex-col gap-2 px-5 pb-5">
              {plans.length === 0 && (
                <li className="text-muted text-sm">{t("dashboard.noPlans")}</li>
              )}
              {plans.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-start gap-2 text-sm">
                  <Timer className="text-muted mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <div className="truncate">{p.title}</div>
                    <div className="text-muted text-xs">
                      {p.plannedOn ? fmtDay(p.plannedOn, locale) : ""}
                      {p.plannedOn && p.plannedOn < today && (
                        <Badge tone="warning" className="ml-1.5">
                          {t("plans.overdue")}
                        </Badge>
                      )}
                      {p.resourceTitle ? ` · ${p.resourceTitle}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t("dashboard.favoriteTopics")} icon={<Tags />} hue="amber" />
            <div className="px-5 pb-5">
              <HBarList
                items={stats.byCategory.slice(0, 5).map((c) => ({
                  key: c.id,
                  label: locale === "uz" ? c.name_uz : c.name_en,
                  value: c.seconds,
                  href: `/library?category=${c.id}`,
                }))}
                formatValue={(v) => fmtMinutes(v, locale)}
                emptyLabel={t("stats.noData")}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title={t("dashboard.recent")} icon={<History />} hue="sky" />
            <ul className="flex flex-col gap-2 px-5 pb-5">
              {recent.length === 0 && (
                <li className="text-muted text-sm">{t("empty.nothingHere")}</li>
              )}
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/library/${r.resourceId}`}
                    className="flex items-center gap-2 text-sm hover:underline"
                  >
                    <Badge tone="primary">{t(`status.${r.status}`)}</Badge>
                    <span className="truncate">{r.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t("dashboard.recentlyAdded")} icon={<Library />} hue="rose" />
            <ul className="grid grid-cols-3 gap-3 px-5 pb-5">
              {recentCatalog.map((r) => (
                <li key={r.id}>
                  <Link href={`/library/${r.id}`} className="block" title={r.title}>
                    <Cover
                      type={r.type}
                      title={r.title}
                      src={coverSrc(r)}
                      className="aspect-[2/3] h-auto w-full"
                    />
                    <span className="mt-1 line-clamp-2 text-[11px] leading-tight">{r.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

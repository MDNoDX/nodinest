import { BookCheck, Clock, FileStack, GraduationCap, Library, Star, Trophy } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BarChart } from "@/components/charts/bar-chart";
import { HBarList } from "@/components/charts/hbar-list";
import { Card, CardHeader, EmptyState, PageHeader, StatTile } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fmtMinutes } from "@/lib/format";
import { pageContext, sp, type SP } from "@/lib/page";
import { getCollectionStats } from "@/server/stats";
import { asLocale, intlTag, pickName } from "@/i18n/config";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("stats"))("title") };
}

export default async function StatsPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, locale, tz } = await pageContext();
  const t = await getTranslations();
  const params = await searchParams;
  const y = Number(sp(params.year));
  const pace = sp(params.fast) === "pace";
  const year = Number.isInteger(y) && y > 1900 && y < 2200 ? y : null;
  const [s, all] = await Promise.all([
    getCollectionStats(db, ctx, { timeZone: tz, year }),
    year ? getCollectionStats(db, ctx, { timeZone: tz }) : Promise.resolve(null),
  ]);
  const years = (all ?? s).years;
  const fastest = [...s.fastest]
    .filter((f) => !pace || f.per_day != null)
    .sort((a, b) => (pace ? (b.per_day ?? 0) - (a.per_day ?? 0) : a.days - b.days))
    .slice(0, 10);
  const fastHref = (mode: "days" | "pace") =>
    `/stats?${new URLSearchParams({ ...(year ? { year: String(year) } : {}), ...(mode === "pace" ? { fast: "pace" } : {}) })}`;
  const tot = s.totals;
  const nf = new Intl.NumberFormat(intlTag(asLocale(locale)));
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(intlTag(asLocale(locale)), {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2020, i, 1))),
  );

  return (
    <>
      <PageHeader section="stats" title={t("stats.title")} />
      <nav className="mb-6 flex flex-wrap gap-1.5" aria-label={t("stats.byYear")}>
        <Link
          href="/stats"
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm font-medium",
            !year
              ? "bg-primary text-primary-foreground"
              : "bg-surface-2 text-muted hover:text-foreground",
          )}
        >
          {t("stats.allYears")}
        </Link>
        {[...years].reverse().map((yy) => (
          <Link
            key={yy}
            href={`/stats?year=${yy}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium tabular-nums",
              year === yy
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted hover:text-foreground",
            )}
          >
            {yy}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<BookCheck />}
          hue="indigo"
          label={t("dashboard.booksRead")}
          value={nf.format(tot.books_read)}
          hint={`${t("stats.completed")}: ${nf.format(tot.completed)}`}
        />
        <StatTile
          icon={<FileStack />}
          hue="blue"
          label={t("stats.pagesRead")}
          value={nf.format(tot.pages_read)}
        />
        <StatTile
          icon={<GraduationCap />}
          hue="teal"
          label={t("dashboard.coursesDone")}
          value={nf.format(tot.courses_done)}
          hint={
            tot.lessons_done ? `${t("stats.lessons")}: ${nf.format(tot.lessons_done)}` : undefined
          }
        />
        <StatTile
          icon={<Clock />}
          hue="rose"
          label={t("stats.media")}
          value={fmtMinutes(tot.media_seconds, locale)}
          hint={`${t("dashboard.mediaDone")}: ${tot.media_done}`}
        />
        <StatTile
          icon={<Library />}
          hue="sky"
          label={t("stats.library")}
          value={nf.format(tot.library)}
          hint={`${t("status.in_progress")}: ${tot.in_progress} · ${t("status.planned")}: ${tot.planned}`}
        />
        <StatTile
          icon={<Star />}
          hue="amber"
          label={t("stats.avgRating")}
          value={tot.avg_rating ? `${tot.avg_rating}/10` : "—"}
          hint={t("dashboard.rated", { count: tot.rated })}
        />
        {s.longest && (
          <StatTile
            icon={<Trophy />}
            hue="violet"
            label={t("stats.longest")}
            value={t("card.pages", { count: nf.format(s.longest.pages) })}
            hint={s.longest.title}
          />
        )}
        {s.best && (
          <StatTile
            icon={<Trophy />}
            hue="orange"
            label={t("stats.best")}
            value={`${s.best.rating}/10`}
            hint={s.best.title}
          />
        )}
      </div>

      {tot.completed === 0 && tot.library === 0 ? (
        <EmptyState
          className="mt-6"
          title={t("stats.noData")}
          action={
            <Link href="/library/new" className="text-primary text-sm font-medium hover:underline">
              {t("nav.newResource")}
            </Link>
          }
        />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          {year ? (
            <Card className="lg:col-span-2">
              <CardHeader title={t("stats.byMonth")} />
              <div className="px-5 pb-5">
                <BarChart
                  ariaLabel={t("stats.byMonth")}
                  height={170}
                  data={monthNames.map((m, i) => {
                    const v = s.byMonth.find((x) => x.month === i + 1)?.completed ?? 0;
                    return { label: `${m} ${year}`, short: m, value: v, display: String(v) };
                  })}
                />
              </div>
            </Card>
          ) : (
            s.byYear.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader title={t("stats.byYear")} />
                <div className="px-5 pb-5">
                  <BarChart
                    ariaLabel={t("stats.byYear")}
                    height={170}
                    data={s.byYear.map((x) => ({
                      label: `${x.year}: ${x.pages} ${t("progressUnits.pages")}`,
                      short: String(x.year),
                      value: x.completed,
                      display: String(x.completed),
                    }))}
                  />
                </div>
              </Card>
            )
          )}
          {s.fastest.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader
                title={t("stats.fastest")}
                action={
                  <div className="bg-surface-2 flex rounded-lg p-0.5 text-xs">
                    {(["days", "pace"] as const).map((m) => (
                      <Link
                        key={m}
                        href={fastHref(m)}
                        scroll={false}
                        aria-current={(m === "pace") === pace ? "true" : undefined}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium",
                          (m === "pace") === pace
                            ? "bg-surface text-foreground shadow-sm"
                            : "text-muted hover:text-foreground",
                        )}
                      >
                        {t(m === "pace" ? "stats.byPace" : "stats.byDays")}
                      </Link>
                    ))}
                  </div>
                }
              />
              <ol className="divide-border divide-y px-5 pb-3">
                {fastest.map((f, i) => (
                  <li key={f.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="text-muted w-5 shrink-0 text-right tabular-nums">{i + 1}</span>
                    <Link
                      href={`/library/${f.id}`}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {f.title}
                    </Link>
                    <span className="text-muted shrink-0 text-xs tabular-nums">
                      {f.pages ? t("card.pages", { count: f.pages }) : ""}
                    </span>
                    <span
                      className={cn(
                        "w-20 shrink-0 text-right tabular-nums",
                        !pace && "font-semibold",
                      )}
                    >
                      {t("stats.days", { count: f.days })}
                    </span>
                    <span
                      className={cn(
                        "w-24 shrink-0 text-right tabular-nums",
                        pace ? "font-semibold" : "text-muted",
                      )}
                    >
                      {f.per_day != null ? t("stats.perDay", { n: nf.format(f.per_day) }) : "—"}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          <Card>
            <CardHeader title={t("stats.byType")} />
            <div className="px-5 pb-5">
              <HBarList
                items={s.byType.map((x) => ({
                  key: x.type,
                  label: `${t(`types.plural.${x.type}`)} · ${x.completed}/${x.total}`,
                  value: x.total,
                  href: `/library?type=${x.type}`,
                }))}
                formatValue={(v) => String(v)}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("stats.ratings")} />
            <div className="px-5 pb-5">
              <BarChart
                ariaLabel={t("stats.ratings")}
                height={140}
                data={Array.from({ length: 10 }, (_, i) => {
                  const v = s.ratings.find((r) => r.rating === i + 1)?.n ?? 0;
                  return {
                    label: `${i + 1}/10`,
                    short: String(i + 1),
                    value: v,
                    display: String(v),
                  };
                })}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("stats.authors")} />
            <div className="px-5 pb-5">
              <HBarList
                items={s.authors.map((a) => ({
                  key: a.id,
                  label: a.name,
                  value: a.n,
                  href: `/people/${a.id}`,
                }))}
                formatValue={(v) => String(v)}
                emptyLabel={t("empty.nothingHere")}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("stats.topics")} />
            <div className="px-5 pb-5">
              <HBarList
                items={s.topics.map((c) => ({
                  key: c.id,
                  label: pickName(asLocale(locale), {
                    uz: c.name_uz,
                    ru: c.name_ru,
                    en: c.name_en,
                  }),
                  value: c.n,
                  href: `/library?category=${c.id}`,
                }))}
                formatValue={(v) => String(v)}
                emptyLabel={t("empty.nothingHere")}
              />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

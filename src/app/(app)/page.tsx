import {
  BookCheck,
  BookOpen,
  FileStack,
  GraduationCap,
  MonitorPlay,
  Plus,
  Quote,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ProgressBar } from "@/components/charts/hbar-list";
import { Cover, coverSrc } from "@/components/library/cover";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, IconChip } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { hueStyle, type Hue } from "@/lib/hues";
import { listGoalsWithProgress } from "@/server/goals";
import { getCollection, listCollections, listNotes } from "@/server/notes";
import { listMyRecords } from "@/server/records";
import { getCollectionStats } from "@/server/stats";

export const dynamic = "force-dynamic";

function Counter({
  label,
  value,
  sub,
  icon,
  hue,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  hue: Hue;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="card group relative overflow-hidden p-4 transition-shadow hover:shadow-md"
      style={hueStyle(hue)}
    >
      <span aria-hidden className="hue-bar absolute inset-x-0 top-0 h-1" />
      <div className="flex items-center justify-between">
        <span className="text-muted text-xs font-medium">{label}</span>
        <IconChip icon={icon} hue={hue} className="size-8 rounded-lg" />
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-muted mt-0.5 text-xs">{sub}</div>}
    </Link>
  );
}

export default async function DashboardPage() {
  const { user, ctx, db, locale, tz, today } = await pageContext();
  const t = await getTranslations();
  const year = Number(today.slice(0, 4));
  const [records, stats, goals, notes, cols] = await Promise.all([
    listMyRecords(db, ctx),
    getCollectionStats(db, ctx, { timeZone: tz }),
    listGoalsWithProgress(db, ctx, today, tz),
    listNotes(db, ctx, {}),
    listCollections(db, ctx),
  ]);
  const ranked = cols.filter((c) => c.ranked && c.count > 0).slice(0, 2);
  const rankedDetails = await Promise.all(ranked.map((c) => getCollection(db, ctx, c.id)));
  const reading = records.filter((r) => r.status === "in_progress").slice(0, 6);
  const finished = records.filter((r) => r.status === "completed").slice(0, 18);
  const yearGoal = goals.find((g) => g.status === "active" && g.period === "year");
  const s = stats.totals;
  const nf = new Intl.NumberFormat(locale === "uz" ? "uz-UZ" : "en-US");
  const hours = Math.round(s.media_seconds / 360) / 10;

  return (
    <>
      <section className="hero -mx-4 -mt-6 mb-7 rounded-b-3xl px-4 pt-7 pb-6 sm:-mx-6 sm:-mt-8 sm:px-6 sm:pt-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              name={user.name}
              image={user.image}
              className="ring-surface size-16 text-xl ring-4"
            />
            <div>
              <div className="text-muted text-xs font-semibold tracking-wide uppercase">
                {t("dashboard.heroSubtitle")}
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{user.name}</h1>
              <div className="text-muted mt-0.5 text-sm">
                {t("dashboard.inLibrary", { count: s.library })}
                {s.avg_rating ? (
                  <span className="ml-2 inline-flex items-center gap-1">
                    · <Star className="size-3.5 fill-[var(--c-amber)] text-[var(--c-amber)]" />{" "}
                    {s.avg_rating}/10
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/assistant">
                <Sparkles /> AI
              </Link>
            </Button>
            <Button asChild>
              <Link href="/library/new">
                <Plus /> {t("nav.newResource")}
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Counter
            label={t("dashboard.booksRead")}
            value={nf.format(s.books_read)}
            icon={<BookCheck />}
            hue="indigo"
            href="/library?status=completed&type=book"
          />
          <Counter
            label={t("dashboard.pagesRead")}
            value={nf.format(s.pages_read)}
            icon={<FileStack />}
            hue="blue"
            href="/stats"
          />
          <Counter
            label={t("dashboard.coursesDone")}
            value={nf.format(s.courses_done)}
            sub={s.lessons_done ? `${s.lessons_done} ${t("progressUnits.lessons")}` : undefined}
            icon={<GraduationCap />}
            hue="teal"
            href="/library?status=completed&type=course"
          />
          <Counter
            label={t("dashboard.mediaDone")}
            value={nf.format(s.media_done)}
            sub={hours ? t("dashboard.mediaHours", { hours }) : undefined}
            icon={<MonitorPlay />}
            hue="rose"
            href="/stats"
          />
        </div>
      </section>

      {s.library === 0 && (
        <EmptyState
          className="mb-8"
          icon={<BookOpen />}
          title={t("dashboard.emptyTitle")}
          body={t("dashboard.emptyBody")}
          action={
            <Button asChild>
              <Link href="/library/new">
                <Plus /> {t("nav.newResource")}
              </Link>
            </Button>
          }
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={t("dashboard.reading")}
              icon={<BookOpen />}
              hue="blue"
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
              {reading.length === 0 ? (
                <p className="text-muted text-sm">{t("dashboard.emptyReading")}</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {reading.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/library/${r.resourceId}`}
                        className="border-border hover:bg-surface-2/60 flex gap-3 rounded-xl border p-3 transition-colors"
                      >
                        <Cover
                          type={r.type}
                          title={r.title}
                          src={coverSrc(r)}
                          className="h-24 w-16 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-sm font-semibold">{r.title}</div>
                          {r.authors && (
                            <div className="text-muted truncate text-xs">{r.authors}</div>
                          )}
                          {r.progressTotal ? (
                            <div className="mt-2.5">
                              <ProgressBar
                                value={r.progressCurrent ?? 0}
                                max={r.progressTotal}
                                label={r.title}
                              />
                              <div className="text-muted mt-1 text-[11px] tabular-nums">
                                {r.progressCurrent ?? 0} / {r.progressTotal}{" "}
                                {t(`progressUnits.${r.progressUnit}`)} ·{" "}
                                {Math.round(((r.progressCurrent ?? 0) / r.progressTotal) * 100)}%
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("dashboard.finishedWall")}
              icon={<BookCheck />}
              hue="emerald"
              action={
                <Link
                  href="/library?status=completed"
                  className="text-primary text-xs font-medium hover:underline"
                >
                  {t("common.seeAll")}
                </Link>
              }
            />
            <div className="px-5 pb-5">
              {finished.length === 0 ? (
                <p className="text-muted text-sm">{t("dashboard.emptyFinished")}</p>
              ) : (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {finished.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/library/${r.resourceId}`}
                        title={r.title}
                        className="group block"
                      >
                        <Cover
                          type={r.type}
                          title={r.title}
                          src={coverSrc(r)}
                          className="aspect-[2/3] h-auto w-full shadow-sm transition-transform group-hover:-translate-y-1 group-hover:shadow-md"
                        />
                        {r.rating ? (
                          <div className="mt-1 flex items-center gap-0.5 text-[11px] font-semibold tabular-nums">
                            <Star className="size-3 fill-[var(--c-amber)] text-[var(--c-amber)]" />{" "}
                            {r.rating}
                          </div>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {notes.items.length > 0 && (
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
              <ul className="divide-border divide-y px-5 pb-4">
                {notes.items.slice(0, 4).map((n) => (
                  <li key={n.id} className="py-3">
                    <Link href={`/notes/${n.id}`} className="block hover:opacity-80">
                      {n.kind === "quote" ? (
                        <blockquote className="line-clamp-2 border-l-2 border-[var(--c-violet)] pl-3 font-serif italic">
                          “{n.quoteText}”
                        </blockquote>
                      ) : (
                        <p className="line-clamp-2 text-sm">
                          {n.title && <strong>{n.title} — </strong>}
                          <span className="text-muted">{n.body}</span>
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <Card className="p-5" style={hueStyle("amber")}>
            <div className="flex items-center gap-2.5">
              <IconChip icon={<Target />} hue="amber" />
              <h2 className="text-sm font-semibold">{t("dashboard.yearGoal", { year })}</h2>
            </div>
            {yearGoal ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold tabular-nums">{yearGoal.value}</span>
                  <span className="text-muted text-sm">/ {yearGoal.target}</span>
                </div>
                <div className="mt-2">
                  <ProgressBar
                    value={yearGoal.value}
                    max={yearGoal.target}
                    label={yearGoal.title}
                  />
                </div>
                <div className="text-muted mt-1.5 text-xs">{yearGoal.title}</div>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-muted text-sm">{t("dashboard.noYearGoal")}</p>
                <Button size="sm" variant="outline" className="mt-3" asChild>
                  <Link href="/plans">{t("dashboard.setGoal")}</Link>
                </Button>
              </div>
            )}
          </Card>

          {rankedDetails.filter(Boolean).map((c) => (
            <Card key={c!.collection.id}>
              <CardHeader
                title={c!.collection.name ?? ""}
                icon={<Trophy />}
                hue="amber"
                action={
                  <Link
                    href={`/collections/${c!.collection.id}`}
                    className="text-primary text-xs font-medium hover:underline"
                  >
                    {t("common.seeAll")}
                  </Link>
                }
              />
              <ol className="flex flex-col gap-2 px-5 pb-5">
                {c!.items.slice(0, 5).map((it, i) =>
                  it.resourceId ? (
                    <li key={it.id}>
                      <Link
                        href={`/library/${it.resourceId}`}
                        className="flex items-center gap-3 text-sm hover:underline"
                      >
                        <span
                          className={
                            i < 3
                              ? "w-6 text-center text-base font-bold text-[var(--c-amber)]"
                              : "text-muted w-6 text-center text-sm font-semibold"
                          }
                        >
                          {i + 1}
                        </span>
                        <Cover
                          type={it.resourceType!}
                          title={it.resourceTitle!}
                          src={coverSrc({ coverFileId: it.coverFileId, coverUrl: it.coverUrl })}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {it.resourceTitle}
                        </span>
                      </Link>
                    </li>
                  ) : null,
                )}
              </ol>
            </Card>
          ))}

          {stats.authors.length > 0 && (
            <Card>
              <CardHeader title={t("stats.authors")} icon={<Star />} hue="orange" />
              <ul className="flex flex-col gap-2 px-5 pb-5">
                {stats.authors.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <Link href={`/people/${a.id}`} className="truncate font-medium hover:underline">
                      {a.name}
                    </Link>
                    <span className="text-muted text-xs tabular-nums">
                      {t("stats.items", { count: a.n })}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

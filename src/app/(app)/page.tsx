import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  BookCheck,
  BookOpen,
  Brain,
  FileStack,
  GraduationCap,
  History,
  MonitorPlay,
  Plus,
  Quote,
  Sparkles,
  Star,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Cover, coverSrc } from "@/components/library/cover";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fmtClock } from "@/lib/clock";
import { Card, CardHeader, EmptyState, IconChip } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { cn } from "@/lib/cn";
import { hueStyle, type Hue } from "@/lib/hues";
import { listGoalsWithProgress } from "@/server/goals";
import { ensureDefaults, getDay } from "@/server/roznoma";
import { TodayCard } from "@/components/roznoma/today-card";
import { listNotes } from "@/server/notes";
import { listMyRecords } from "@/server/records";
import { lastResume } from "@/server/resume";
import { listDecks } from "@/server/study-cards";
import { getCollectionStats } from "@/server/stats";
import { withBookText } from "@/server/reader";
import { StartPath } from "@/components/onboarding/start-path";
import { getStartSteps } from "@/server/onboarding";
import { asLocale, intlTag } from "@/i18n/config";
import { AdCard } from "@/components/ads/ad-card";
import { adFor } from "@/server/ads";

export const dynamic = "force-dynamic";

/**
 * A counter: on a phone small (icon, number and name in one line); from md up
 * the bigger card with the coloured top line.
 */
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
      className="card group relative flex items-center gap-2.5 overflow-hidden px-3 py-2.5 transition-shadow hover:shadow-md md:block md:p-4"
      style={hueStyle(hue)}
    >
      <span aria-hidden className="hue-bar absolute inset-x-0 top-0 h-1 max-md:hidden" />
      <div className="contents md:flex md:items-center md:justify-between">
        <span className="text-muted text-xs font-medium max-md:hidden">{label}</span>
        <IconChip icon={icon} hue={hue} className="size-8 shrink-0 rounded-lg" />
      </div>
      <span className="min-w-0 md:block">
        <span className="block text-lg leading-tight font-bold tabular-nums md:mt-2 md:text-3xl md:tracking-tight">
          {value}
        </span>
        <span className="text-muted block truncate text-[11px] leading-tight md:hidden">
          {label}
          {sub ? ` · ${sub}` : ""}
        </span>
        {sub && <span className="text-muted mt-0.5 block text-xs max-md:hidden">{sub}</span>}
      </span>
    </Link>
  );
}

export default async function DashboardPage() {
  // A guest starts with what people share.
  if (!(await getCurrentUser())) redirect("/media");
  const { user, ctx, db, locale, tz, today } = await pageContext();
  const t = await getTranslations();
  const [records, stats, goals, notes, last, decks, startSteps] = await Promise.all([
    listMyRecords(db, ctx),
    getCollectionStats(db, ctx, { timeZone: tz }),
    listGoalsWithProgress(db, ctx, today, tz),
    listNotes(db, ctx, {}),
    lastResume(db, ctx),
    listDecks(ctx),
    getStartSteps(ctx),
  ]);
  // Röznoma: today's plan (with ticks) and the goals, at a glance.
  await ensureDefaults(ctx, locale);
  const todayPage = await getDay(ctx, today);
  const homeAd = await adFor(ctx, "home");
  const reading = records.filter((r) => r.status === "in_progress").slice(0, 12);
  // Books whose text is on the site open straight in the reader, where the user stopped.
  const readable = await withBookText(
    ctx,
    reading.map((r) => r.resourceId),
  );
  const finished = records.filter((r) => r.status === "completed").slice(0, 18);
  // The year's goal first; else the other active goals (week, month…) are shown.
  const activeGoals = goals.filter((g) => g.status === "active");
  const s = stats.totals;
  const nf = new Intl.NumberFormat(intlTag(asLocale(locale)));
  const hours = Math.round(s.media_seconds / 360) / 10;
  const counters = [
    {
      key: "books",
      show: s.books_read > 0,
      label: t("dashboard.booksRead"),
      value: nf.format(s.books_read),
      icon: <BookCheck />,
      hue: "blue" as Hue,
      href: "/library?status=completed&type=book",
    },
    {
      key: "pages",
      show: s.pages_read > 0,
      label: t("dashboard.pagesRead"),
      value: nf.format(s.pages_read),
      icon: <FileStack />,
      hue: "blue" as Hue,
      href: "/stats",
    },
    {
      key: "courses",
      show: s.courses_done > 0,
      label: t("dashboard.coursesDone"),
      value: nf.format(s.courses_done),
      sub: s.lessons_done ? `${s.lessons_done} ${t("progressUnits.lessons")}` : undefined,
      icon: <GraduationCap />,
      hue: "blue" as Hue,
      href: "/library?status=completed&type=course",
    },
    {
      key: "media",
      show: s.media_done > 0,
      label: t("dashboard.mediaDone"),
      value: nf.format(s.media_done),
      sub: hours ? t("dashboard.mediaHours", { hours }) : undefined,
      icon: <MonitorPlay />,
      hue: "blue" as Hue,
      href: "/stats",
    },
  ].filter((c) => c.show);
  const due = decks.reduce((n, d) => n + d.due, 0);

  return (
    <>
      <section className="hero -mx-4 -mt-6 mb-5 rounded-b-3xl px-4 pt-5 pb-4 sm:-mx-6 sm:-mt-8 sm:mb-7 sm:px-6 sm:pt-8 sm:pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <Link
            href={user.username ? `/u/${user.username}` : "/settings"}
            className="group flex items-center gap-4 rounded-2xl"
          >
            <Avatar
              name={user.name}
              image={user.image}
              className="ring-surface size-12 text-lg ring-4 transition-transform group-hover:scale-105 sm:size-16 sm:text-xl"
            />
            <div className="min-w-0">
              <div className="text-muted text-[11px] font-semibold tracking-wide uppercase sm:text-xs">
                {t("dashboard.heroSubtitle")}
              </div>
              <h1 className="truncate text-xl font-bold tracking-tight group-hover:underline sm:text-3xl">
                {user.name}
              </h1>
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
          </Link>
          {/* All in sight, no sideways scrolling: "continue" takes the whole first line on a
              phone, the rest share the next one (equal widths); on a computer one row. */}
          {/* A phone: one full line each for "continue" and today's questions (their
              words never cut), then AI and "add" side by side; a computer: one row. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {last && (
              <Button
                variant="secondary"
                asChild
                className="col-span-2 h-10 min-w-0 justify-start sm:h-8 sm:max-w-xs sm:px-3 sm:text-sm"
              >
                <Link
                  href={
                    last.place === "resource"
                      ? `/library/${last.resourceId}`
                      : `/library/${last.resourceId}/taqriz`
                  }
                  title={last.title}
                >
                  <History />
                  <span className="truncate">
                    {t("dashboard.continue", { title: last.title })}
                    {last.mediaSeconds ? ` · ${fmtClock(last.mediaSeconds)}` : ""}
                  </span>
                </Link>
              </Button>
            )}
            {due > 0 && (
              <Button
                variant="secondary"
                asChild
                className="col-span-2 h-10 justify-start sm:h-8 sm:px-3 sm:text-sm"
              >
                <Link href="/review">
                  <Brain className="text-[var(--c-teal)]" />
                  <span className="flex-1 text-left">{t("dashboard.dueReview", { n: due })}</span>
                  <ChevronRight className="text-muted sm:hidden" />
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild className="h-10 sm:h-8 sm:px-3 sm:text-sm">
              <Link href="/assistant">
                <Sparkles /> <span className="sm:hidden">{t("nav.assistant")}</span>
                <span className="max-sm:hidden">AI</span>
              </Link>
            </Button>
            <Button asChild data-tour="add" className="h-10 sm:h-8 sm:px-3 sm:text-sm">
              <Link href="/library/new">
                <Plus /> {t("nav.newResource")}
              </Link>
            </Button>
          </div>
        </div>
        {/* Only what has a value: empty counters are noise. */}
        {counters.length > 0 && (
          <div
            className={cn(
              "mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3",
              counters.length >= 4
                ? "md:grid-cols-4"
                : counters.length === 3
                  ? "md:grid-cols-3"
                  : "",
            )}
          >
            {/* A phone shows two a row: an odd last one gets "Metrics →" beside it. */}
            {counters.length % 2 === 1 && (
              <Link
                href="/stats"
                className="card text-primary order-last flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold md:hidden"
              >
                <span className="flex items-center gap-2">
                  <BarChart3 className="size-4" /> {t("nav.stats")}
                </span>
                <ChevronRight className="size-4" />
              </Link>
            )}
            {counters.map((c) => (
              <Counter
                key={c.key}
                label={c.label}
                value={c.value}
                sub={c.sub}
                icon={c.icon}
                hue={c.hue}
                href={c.href}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mb-8 empty:hidden">
        <StartPath steps={startSteps} />
      </div>

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

      {/* Wide screens: more books in a row, the side column stays one. */}
      <div className="grid gap-6 lg:grid-cols-3 2xl:grid-cols-4 [&>*]:min-w-0">
        <div className="flex flex-col gap-6 lg:col-span-2 2xl:col-span-3">
          {reading.length > 0 && (
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
              {/* One row that scrolls sideways: the cover, the title and how far. */}
              <ul className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-5 pb-5">
                {reading.map((r) => {
                  const pct =
                    r.progressTotal && r.progressCurrent != null
                      ? Math.min(100, Math.round((r.progressCurrent / r.progressTotal) * 100))
                      : null;
                  const portrait = r.type === "book" || r.type === "course";
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        "shrink-0 snap-start",
                        portrait ? "w-24 sm:w-28" : "w-40 sm:w-44",
                      )}
                    >
                      <Link
                        href={
                          readable.has(r.resourceId)
                            ? `/library/${r.resourceId}/read`
                            : `/library/${r.resourceId}`
                        }
                        title={r.title}
                        className="group block"
                      >
                        <Cover
                          type={r.type}
                          title={r.title}
                          src={coverSrc(r, 320)}
                          className="w-full shadow-sm"
                        />
                        <span className="mt-1.5 line-clamp-2 text-xs leading-snug font-semibold">
                          {r.title}
                        </span>
                        {pct != null && (
                          <span className="bg-surface-2 mt-1 block h-1 overflow-hidden rounded-full">
                            <span
                              className="bg-primary block h-full rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* Phones: the wall of finished books and the latest notes stay off the home page. */}
          <Card className="max-md:hidden">
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
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6 2xl:grid-cols-9">
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
        </div>

        {/* The day's plan comes first on a phone. */}
        <aside className="flex flex-col gap-6 max-lg:order-first">
          <TodayCard
            day={today}
            items={todayPage.items.map((i) => ({
              id: i.id,
              title: i.title,
              icon: i.icon,
              amount: i.amount,
              time: i.time,
              endTime: i.endTime,
              done: i.done,
              status: i.status,
              value: i.value,
            }))}
            goals={activeGoals.map((g) => ({
              id: g.id,
              title: g.title,
              value: g.value,
              target: g.target,
            }))}
          />

          {/* The narrow column on a computer: the latest notes and quotes (phones skip them). */}
          {notes.items.length > 0 && (
            <Card className="max-md:hidden">
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
                {notes.items.slice(0, 5).map((n) => (
                  <li key={n.id} className="py-3">
                    <Link href={`/notes/${n.id}`} className="block hover:opacity-80">
                      {n.kind === "quote" ? (
                        <blockquote className="line-clamp-3 border-l-2 border-[var(--c-violet)] pl-3 font-serif text-[15px] italic">
                          “{n.quoteText}”
                        </blockquote>
                      ) : (
                        <p className="line-clamp-3 text-sm">
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
        </aside>
      </div>
      {homeAd && (
        <div className="mt-8 max-w-xl">
          <AdCard ad={homeAd} label={t("ads.label")} />
        </div>
      )}
    </>
  );
}

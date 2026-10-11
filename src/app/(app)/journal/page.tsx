import { eq } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ManualSessionForm } from "@/components/journal/manual-session-form";
import { SessionRowActions } from "@/components/journal/session-row-actions";
import { TimerPanel } from "@/components/journal/timer-panel";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/misc";
import { withUser } from "@/db";
import { resources } from "@/db/schema";
import { dayKey } from "@/lib/dates";
import { fmtDate, fmtDay, fmtMinutes } from "@/lib/format";
import { cn } from "@/lib/cn";
import { pageContext, sp, type SP } from "@/lib/page";
import { getOpenSession, listSessions } from "@/server/journal";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("journal"))("title") };
}

export default async function JournalPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, locale, tz, today } = await pageContext();
  const t = await getTranslations();
  const p = await searchParams;
  const logId = sp(p.log);
  const highlight = sp(p.session);
  const [open, sessions, logResource] = await Promise.all([
    getOpenSession(db, ctx),
    listSessions(db, ctx, { limit: 120 }),
    logId && /^[0-9a-f-]{36}$/i.test(logId)
      ? withUser(db, ctx, (tx) =>
          tx
            .select({ id: resources.id, label: resources.title })
            .from(resources)
            .where(eq(resources.id, logId)),
        ).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = dayKey(s.startedAt, tz);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return (
    <>
      <PageHeader section="journal" title={t("journal.title")} subtitle={t("journal.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={t("journal.timer")} />
            <div className="px-5 pb-5">
              <TimerPanel
                session={
                  open && {
                    id: open.id,
                    status: open.status,
                    resourceTitle: open.resourceTitle,
                    activeSeconds: open.activeSeconds,
                    lastResumedAt: open.lastResumedAt?.toISOString() ?? null,
                    serverNow: open.serverNow.toISOString(),
                  }
                }
              />
            </div>
          </Card>
          <Card id="log">
            <CardHeader title={t("journal.logManual")} />
            <div className="px-5 pb-5">
              <ManualSessionForm initialResource={logResource} />
            </div>
          </Card>
        </div>
        <section aria-labelledby="history">
          <h2 id="history" className="mb-3 text-sm font-semibold">
            {t("journal.history")}
          </h2>
          {sessions.length === 0 ? (
            <EmptyState title={t("journal.emptyHistory")} />
          ) : (
            <ol className="flex flex-col gap-5">
              {[...groups.entries()].map(([day, list]) => (
                <li key={day}>
                  <div className="mb-2 flex items-baseline justify-between text-sm">
                    <span className="font-medium">
                      {day === today
                        ? t("common.today")
                        : fmtDay(day, locale, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                    </span>
                    <span className="text-muted text-xs tabular-nums">
                      {fmtMinutes(
                        list.reduce((a, s) => a + s.activeSeconds, 0),
                        locale,
                      )}
                    </span>
                  </div>
                  <ul className="card divide-border divide-y">
                    {list.map((s) => (
                      <li
                        key={s.id}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3",
                          highlight === s.id && "bg-accent-soft",
                        )}
                      >
                        <div className="text-muted w-24 shrink-0 text-xs tabular-nums">
                          {fmtDate(s.startedAt, locale, tz, { timeStyle: "short" })}–
                          {fmtDate(s.endedAt, locale, tz, { timeStyle: "short" })}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            {s.resourceId ? (
                              <Link
                                href={`/library/${s.resourceId}`}
                                className="truncate font-medium hover:underline"
                              >
                                {s.resourceTitle}
                              </Link>
                            ) : (
                              <span className="text-muted">{t("stats.unlinked")}</span>
                            )}
                            {s.source === "manual" && <Badge>{t("journal.manual")}</Badge>}
                          </div>
                          {s.note && <p className="text-muted mt-1 text-sm">{s.note}</p>}
                        </div>
                        <div className="shrink-0 text-sm font-medium tabular-nums">
                          {fmtMinutes(s.activeSeconds, locale)}
                        </div>
                        <SessionRowActions
                          session={{
                            id: s.id,
                            startedAt: s.startedAt.toISOString(),
                            endedAt: (s.endedAt ?? s.startedAt).toISOString(),
                            minutes: Math.max(1, Math.round(s.activeSeconds / 60)),
                            note: s.note,
                            resource: s.resourceId
                              ? { id: s.resourceId, label: s.resourceTitle ?? "" }
                              : null,
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

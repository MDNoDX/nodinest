import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, StatTile } from "@/components/ui/misc";
import { fmtDay, type Loc } from "@/lib/format";
import { productivePercent } from "@/lib/roznoma";
import { PrintButton } from "./print-button";

type H = {
  days: {
    day: string;
    done: number;
    total: number;
    pct: number;
    productive: number | null;
    better: boolean | null;
  }[];
  average: number;
  streak: number;
  week: { pct: number | null; minutes: number };
  prev: { pct: number | null; minutes: number };
  bestDay: { day: string; pct: number } | null;
  today: { pct: number; total: number };
  yesterday: { pct: number; total: number };
};

/** The month's numbers: this week against the last, in plain words. */
export async function StatsView({ h, locale }: { h: H; locale: Loc }) {
  const t = await getTranslations("roznoma");
  const hours = (m: number) => Math.round((m / 60) * 10) / 10;
  const diff = h.week.pct != null && h.prev.pct != null ? h.week.pct - h.prev.pct : null;
  const hoursDiff = hours(h.week.minutes) - hours(h.prev.minutes);
  const notes: { up: boolean | null; text: string }[] = [];
  if (diff != null)
    notes.push({
      up: diff >= 0,
      text:
        diff > 0
          ? t("noteWeekUp", { n: diff })
          : diff < 0
            ? t("noteWeekDown", { n: -diff })
            : t("noteWeekSame"),
    });
  else if (h.week.pct != null) notes.push({ up: null, text: t("noteFirstWeek") });
  if (h.week.minutes || h.prev.minutes)
    notes.push({
      up: hoursDiff >= 0,
      text:
        hoursDiff >= 0
          ? t("noteHoursUp", { n: Math.round(hoursDiff * 10) / 10 })
          : t("noteHoursDown", { n: -Math.round(hoursDiff * 10) / 10 }),
    });
  if (h.today.total && h.yesterday.total) {
    const d = h.today.pct - h.yesterday.pct;
    notes.push({
      up: d >= 0,
      text: d >= 0 ? t("noteTodayUp", { n: d }) : t("noteTodayDown", { n: -d }),
    });
  }
  if (h.bestDay && h.bestDay.pct > 0)
    notes.push({
      up: true,
      text: t("noteBest", { day: fmtDay(h.bestDay.day, locale), n: h.bestDay.pct }),
    });

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-2 p-5" id="week-report">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary size-4" />
          <h2 className="flex-1 font-semibold">{t("weekTitle")}</h2>
          <PrintButton label={t("savePdf")} />
        </div>
        {notes.length ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {notes.map((n, i) => (
              <li key={i} className="flex items-start gap-2">
                {n.up === false ? (
                  <TrendingDown className="mt-0.5 size-4 shrink-0 text-[var(--c-amber)]" />
                ) : (
                  <TrendingUp className="mt-0.5 size-4 shrink-0 text-[var(--c-emerald)]" />
                )}
                {n.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-sm">{t("noteEmpty")}</p>
        )}
        <p className="text-muted text-xs">{t("weekHint")}</p>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t("statAverage")} value={`${h.average}%`} />
        <StatTile label={t("statStreak")} value={t("daysN", { n: h.streak })} />
        <StatTile
          label={t("statProductive")}
          value={`${hours(h.week.minutes)} ${t("hoursShort")}`}
          hint={`${productivePercent(Math.round(h.week.minutes / 7))}% ${t("perDay")}`}
        />
        <StatTile
          label={t("statBetter")}
          value={`${h.days.filter((d) => d.better === true).length} / ${h.days.filter((d) => d.better != null).length}`}
        />
      </div>
      <Card>
        <CardHeader title={t("statDaily")} />
        <div className="px-5 pb-5">
          <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={t("statDaily")}>
            {h.days.map((d) => (
              <div
                key={d.day}
                className="flex h-full flex-1 flex-col justify-end"
                title={`${fmtDay(d.day, locale)}: ${d.total ? `${d.done}/${d.total} · ${d.pct}%` : "—"}`}
              >
                <div
                  className={
                    d.pct >= 80
                      ? "rounded-t-[4px] bg-[var(--c-emerald)]"
                      : "bg-primary rounded-t-[4px] opacity-80"
                  }
                  style={{ height: `${d.total ? Math.max(3, d.pct) : 0}%` }}
                />
              </div>
            ))}
          </div>
          <div className="text-muted mt-1 flex justify-between text-[11px] tabular-nums">
            <span>{fmtDay(h.days[0].day, locale)}</span>
            <span>{fmtDay(h.days[h.days.length - 1].day, locale)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { Card, CardHeader, StatTile } from "@/components/ui/misc";
import { fmtDay, type Loc } from "@/lib/format";

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
  productiveHours: number;
  better: number;
  worse: number;
  missed: [string, number][];
};

/** The last 30 days of the Röznoma in numbers. */
export async function StatsView({ h, locale }: { h: H; locale: Loc }) {
  const t = await getTranslations("roznoma");
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t("statAverage")} value={`${h.average}%`} />
        <StatTile label={t("statStreak")} value={t("daysN", { n: h.streak })} />
        <StatTile label={t("statProductive")} value={`${h.productiveHours} ${t("hoursShort")}`} />
        <StatTile label={t("statBetter")} value={`${h.better} ✅ · ${h.worse} ❌`} />
      </div>
      <Card>
        <CardHeader title={t("statDaily")} />
        <div className="px-5 pb-5">
          <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={t("statDaily")}>
            {h.days.map((d) => (
              <div
                key={d.day}
                className="group relative flex h-full flex-1 flex-col justify-end"
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
      {h.missed.length > 0 && (
        <Card>
          <CardHeader title={t("statMissed")} />
          <ul className="flex flex-col gap-1.5 px-5 pb-5 text-sm">
            {h.missed.map(([title, n]) => (
              <li key={title} className="flex justify-between gap-3">
                <span>{title}</span>
                <span className="text-muted tabular-nums">{t("daysN", { n })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

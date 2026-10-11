import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ProgressBar } from "@/components/charts/hbar-list";
import { GoalActions } from "@/components/plans/goal-actions";
import { GoalDialog } from "@/components/plans/goal-form";
import { PlanList } from "@/components/plans/plan-list";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { pageContext, sp, type SP } from "@/lib/page";
import { listGoalsWithProgress, listPlans } from "@/server/goals";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("plans"))("title") };
}

export default async function PlansPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, tz, today } = await pageContext();
  const t = await getTranslations();
  const showDone = sp((await searchParams).done) === "1";
  const [goals, plans] = await Promise.all([
    listGoalsWithProgress(db, ctx, today, tz),
    listPlans(db, ctx, { includeDone: showDone }),
  ]);
  return (
    <>
      <PageHeader
        title={t("plans.title")}
        subtitle={t("plans.subtitle")}
        actions={<GoalDialog />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("plans.goals")} />
          <ul className="flex flex-col gap-5 px-5 pb-5">
            {goals.length === 0 && <li className="text-muted text-sm">{t("plans.noGoals")}</li>}
            {goals.map((g) => (
              <li key={g.id} className={g.status !== "active" ? "opacity-60" : undefined}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{g.title}</span>
                  <span className="text-muted text-sm tabular-nums">
                    {t("plans.progress", { value: g.value, target: g.target })}
                  </span>
                </div>
                <div className="my-2">
                  <ProgressBar value={g.value} max={g.target} label={g.title} />
                </div>
                <div className="text-muted flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>
                    {t(`plans.periods.${g.period}`)} · {t(`plans.metrics.${g.metric}`)}
                    {g.resourceType ? ` · ${t(`types.${g.resourceType}`)}` : ""}
                    {g.status !== "active" && (
                      <Badge
                        className="ml-2"
                        tone={g.status === "achieved" ? "success" : "neutral"}
                      >
                        {g.status === "achieved" ? t("plans.achieved") : t("common.archived")}
                      </Badge>
                    )}
                  </span>
                  <GoalActions id={g.id} status={g.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader
            title={t("plans.plans")}
            action={
              <Link
                href={showDone ? "/plans" : "/plans?done=1"}
                className="text-primary text-xs font-medium hover:underline"
              >
                {showDone ? t("common.reset") : t("plans.showDone")}
              </Link>
            }
          />
          <div className="px-5 pb-5">
            <PlanList plans={plans} today={today} />
          </div>
        </Card>
      </div>
    </>
  );
}

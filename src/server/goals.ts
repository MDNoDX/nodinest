/**
 * Goals ("read 24 books this year", "3000 pages this month") and plans
 * ("read X from 1 May to 20 May"). Progress comes from completed records.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withUser, type AppContext, type Database } from "@/db/client";
import { goals, plans, resources } from "@/db/schema";
import { addDays, startOfWeekKey } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { goalInput, planInput, zodFieldErrors } from "@/lib/validation";

export async function saveGoal(database: Database, ctx: AppContext, raw: unknown, id?: string) {
  const parsed = goalInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_goal", { fieldErrors: zodFieldErrors(parsed.error) });
  return withUser(database, ctx, async (tx) => {
    if (id) {
      const res = await tx
        .update(goals)
        .set(parsed.data)
        .where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
        .returning({ id: goals.id });
      if (!res.length) throw new AppError("NOT_FOUND");
      return id;
    }
    const [row] = await tx
      .insert(goals)
      .values({ ...parsed.data, userId: ctx.userId })
      .returning({ id: goals.id });
    return row.id;
  });
}

export async function setGoalStatus(
  database: Database,
  ctx: AppContext,
  id: string,
  status: "active" | "achieved" | "archived",
) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .update(goals)
      .set({ status })
      .where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
      .returning({ id: goals.id });
    if (!res.length) throw new AppError("NOT_FOUND");
  });
}

export async function deleteGoal(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, (tx) =>
    tx.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, ctx.userId))),
  );
}

/** Inclusive [from, to] day range for a goal period containing `today`. */
export function periodRange(
  period: "day" | "week" | "month" | "year",
  today: string,
): [string, string] {
  if (period === "day") return [today, today];
  if (period === "week") {
    const from = startOfWeekKey(today);
    return [from, addDays(from, 6)];
  }
  const [y, m] = today.split("-").map(Number);
  if (period === "month") {
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return [from, addDays(next, -1)];
  }
  return [`${y}-01-01`, `${y}-12-31`];
}

export type GoalProgress = {
  id: string;
  title: string;
  metric: "completed_resources" | "pages";
  period: "day" | "week" | "month" | "year";
  target: number;
  resourceType: string | null;
  status: "active" | "achieved" | "archived";
  note: string | null;
  value: number;
  from: string;
  to: string;
};

export async function listGoalsWithProgress(
  database: Database,
  ctx: AppContext,
  today: string,
  timeZone: string,
): Promise<GoalProgress[]> {
  return withUser(database, ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(goals)
      .where(eq(goals.userId, ctx.userId))
      .orderBy(asc(goals.status), desc(goals.createdAt));
    const out: GoalProgress[] = [];
    for (const g of rows) {
      const [from, to] = periodRange(g.period, today);
      const typeFilter = g.resourceType ? sql`and r.type = ${g.resourceType}` : sql``;
      const [r] = await tx.execute<{ n: number; pages: number }>(sql`
        select count(*)::int as n, coalesce(sum(b.page_count), 0)::int as pages
        from nodinest.learning_records lr
        join nodinest.resources r on r.id = lr.resource_id
        left join nodinest.book_details b on b.resource_id = r.id
        where lr.user_id = ${ctx.userId} and lr.status = 'completed'
          and (lr.completed_at at time zone ${timeZone})::date between ${from}::date and ${to}::date ${typeFilter}`);
      out.push({
        id: g.id,
        title: g.title,
        // Legacy time-based metrics (v1) fall back to the completed count.
        metric: g.metric === "pages" ? "pages" : "completed_resources",
        period: g.period,
        target: g.target,
        resourceType: g.resourceType,
        status: g.status,
        note: g.note,
        value: g.metric === "pages" ? r.pages : r.n,
        from,
        to,
      });
    }
    return out;
  });
}

export async function savePlan(database: Database, ctx: AppContext, raw: unknown, id?: string) {
  const parsed = planInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_plan", { fieldErrors: zodFieldErrors(parsed.error) });
  return withUser(database, ctx, async (tx) => {
    if (parsed.data.resourceId) {
      const [r] = await tx
        .select({ id: resources.id })
        .from(resources)
        .where(eq(resources.id, parsed.data.resourceId));
      if (!r) throw new AppError("VALIDATION", "unknown_resource");
    }
    if (id) {
      const res = await tx
        .update(plans)
        .set(parsed.data)
        .where(and(eq(plans.id, id), eq(plans.userId, ctx.userId)))
        .returning({ id: plans.id });
      if (!res.length) throw new AppError("NOT_FOUND");
      return id;
    }
    const [row] = await tx
      .insert(plans)
      .values({ ...parsed.data, userId: ctx.userId })
      .returning({ id: plans.id });
    return row.id;
  });
}

export async function togglePlan(database: Database, ctx: AppContext, id: string, done: boolean) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .update(plans)
      .set({ done })
      .where(and(eq(plans.id, id), eq(plans.userId, ctx.userId)))
      .returning({ id: plans.id });
    if (!res.length) throw new AppError("NOT_FOUND");
  });
}

export async function deletePlan(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, (tx) =>
    tx.delete(plans).where(and(eq(plans.id, id), eq(plans.userId, ctx.userId))),
  );
}

export async function listPlans(
  database: Database,
  ctx: AppContext,
  opts: { includeDone?: boolean } = {},
) {
  return withUser(database, ctx, (tx) =>
    tx
      .select({
        id: plans.id,
        title: plans.title,
        startOn: plans.startOn,
        endOn: plans.endOn,
        done: plans.done,
        note: plans.note,
        resourceId: plans.resourceId,
        resourceTitle: resources.title,
        resourceType: resources.type,
        coverUrl: resources.coverUrl,
        coverFileId: resources.coverFileId,
      })
      .from(plans)
      .leftJoin(resources, eq(resources.id, plans.resourceId))
      .where(
        and(eq(plans.userId, ctx.userId), opts.includeDone ? undefined : eq(plans.done, false)),
      )
      .orderBy(sql`${plans.startOn} asc nulls last`, desc(plans.createdAt))
      .limit(200),
  );
}

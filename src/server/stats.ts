/**
 * Learning statistics computed from real session/record data only.
 * Days are bucketed in the user's time zone; a session is attributed to the
 * day it started.
 */
import { sql } from "drizzle-orm";
import { withUser, type AppContext, type Database } from "@/db/client";
import { addDays, startOfWeekKey } from "@/lib/dates";
import { computeStreaks } from "@/lib/streaks";

export type StatsRange = { from: string; to: string };

export async function getStats(
  database: Database,
  ctx: AppContext,
  opts: { timeZone: string; today: string; range: StatsRange; resourceType?: string | null },
) {
  const { timeZone: tz, today, range } = opts;
  const typeFilter = opts.resourceType ? sql`and r.type = ${opts.resourceType}` : sql``;
  const dayExpr = sql`(s.started_at at time zone ${tz})::date`;
  const base = sql`from nodinest.study_sessions s left join nodinest.resources r on r.id = s.resource_id
    where s.user_id = ${ctx.userId} and s.status = 'completed' and s.deleted_at is null ${typeFilter}`;

  return withUser(database, ctx, async (tx) => {
    const daily = await tx.execute<{ day: string; seconds: number; sessions: number }>(sql`
      select to_char(${dayExpr}, 'YYYY-MM-DD') as day, sum(s.active_seconds)::int as seconds, count(*)::int as sessions
      ${base} and ${dayExpr} between ${range.from}::date and ${range.to}::date
      group by 1 order by 1`);

    const byType = await tx.execute<{ type: string | null; seconds: number }>(sql`
      select r.type::text as type, sum(s.active_seconds)::int as seconds
      ${base} and ${dayExpr} between ${range.from}::date and ${range.to}::date
      group by 1 order by 2 desc`);

    const byCategory = await tx.execute<{
      id: string;
      name_uz: string;
      name_en: string;
      seconds: number;
    }>(sql`
      select c.id, c.name_uz, c.name_en, sum(s.active_seconds)::int as seconds
      from nodinest.study_sessions s
      join nodinest.resources r on r.id = s.resource_id
      join nodinest.resource_categories rc on rc.resource_id = r.id
      join nodinest.categories c on c.id = rc.category_id
      where s.user_id = ${ctx.userId} and s.status = 'completed' and s.deleted_at is null ${typeFilter}
        and ${dayExpr} between ${range.from}::date and ${range.to}::date
      group by c.id, c.name_uz, c.name_en
      order by seconds desc limit 8`);

    const topResources = await tx.execute<{
      id: string;
      title: string;
      type: string;
      seconds: number;
    }>(sql`
      select r.id, r.title, r.type::text as type, sum(s.active_seconds)::int as seconds
      ${base} and s.resource_id is not null and ${dayExpr} between ${range.from}::date and ${range.to}::date
      group by r.id, r.title, r.type order by seconds desc limit 6`);

    const weekStart = startOfWeekKey(today);
    const monthStart = `${today.slice(0, 7)}-01`;
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const [totals] = await tx.execute<{
      week: number;
      month: number;
      year: number;
      all_time: number;
      prev_week: number;
    }>(sql`
      select
        coalesce(sum(s.active_seconds) filter (where ${dayExpr} >= ${weekStart}::date), 0)::int as week,
        coalesce(sum(s.active_seconds) filter (where ${dayExpr} >= ${monthStart}::date), 0)::int as month,
        coalesce(sum(s.active_seconds) filter (where ${dayExpr} >= ${yearStart}::date), 0)::int as year,
        coalesce(sum(s.active_seconds) filter (where ${dayExpr} >= ${addDays(weekStart, -7)}::date and ${dayExpr} < ${weekStart}::date), 0)::int as prev_week,
        coalesce(sum(s.active_seconds), 0)::int as all_time
      ${base}`);

    const activeDays = await tx.execute<{ day: string }>(sql`
      select distinct to_char(${dayExpr}, 'YYYY-MM-DD') as day ${base} and s.active_seconds > 0`);
    const streaks = computeStreaks(
      activeDays.map((d) => d.day),
      today,
    );

    const [records] = await tx.execute<{
      planned: number;
      in_progress: number;
      completed: number;
      paused: number;
      abandoned: number;
      completed_in_range: number;
    }>(sql`
      select
        count(*) filter (where lr.status = 'planned')::int as planned,
        count(*) filter (where lr.status = 'in_progress')::int as in_progress,
        count(*) filter (where lr.status = 'completed')::int as completed,
        count(*) filter (where lr.status = 'paused')::int as paused,
        count(*) filter (where lr.status = 'abandoned')::int as abandoned,
        count(*) filter (where lr.status = 'completed' and lr.completed_on between ${range.from}::date and ${range.to}::date)::int as completed_in_range
      from nodinest.learning_records lr join nodinest.resources r on r.id = lr.resource_id
      where lr.user_id = ${ctx.userId} ${typeFilter}`);

    const weekly = await tx.execute<{ week: string; seconds: number }>(sql`
      select to_char(date_trunc('week', ${dayExpr}), 'YYYY-MM-DD') as week, sum(s.active_seconds)::int as seconds
      ${base} and ${dayExpr} >= ${addDays(weekStart, -7 * 11)}::date
      group by 1 order by 1`);

    const monthly = await tx.execute<{ month: string; seconds: number; sessions: number }>(sql`
      select to_char(${dayExpr}, 'YYYY-MM') as month, sum(s.active_seconds)::int as seconds, count(*)::int as sessions
      ${base} and ${dayExpr} >= (${yearStart}::date - interval '1 year')
      group by 1 order by 1`);

    const hourOfDay = await tx.execute<{ hour: number; seconds: number }>(sql`
      select extract(hour from s.started_at at time zone ${tz})::int as hour, sum(s.active_seconds)::int as seconds
      ${base} and ${dayExpr} between ${range.from}::date and ${range.to}::date
      group by 1 order by 1`);

    return {
      daily,
      byType,
      byCategory,
      topResources,
      totals: totals ?? { week: 0, month: 0, year: 0, all_time: 0, prev_week: 0 },
      streaks,
      records: records ?? {
        planned: 0,
        in_progress: 0,
        completed: 0,
        paused: 0,
        abandoned: 0,
        completed_in_range: 0,
      },
      weekly,
      monthly,
      hourOfDay,
    };
  });
}

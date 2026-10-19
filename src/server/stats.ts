/**
 * Collection metrics ("Ko‘rsatkichlar") computed from the user's library:
 * how many books / courses / videos, pages read, minutes watched, ratings,
 * yearly totals, favourite authors and topics. Real data only.
 *
 * "Read pages" = page_count of completed books + current progress (pages) of
 * books in progress. "Watched minutes" = duration of completed media.
 * Years/months come from `completed_at` in the user's time zone.
 */
import { sql } from "drizzle-orm";
import { withUser, type AppContext, type Database } from "@/db/client";

export type CollectionStats = Awaited<ReturnType<typeof getCollectionStats>>;

export async function getCollectionStats(
  database: Database,
  ctx: AppContext,
  opts: { timeZone: string; year?: number | null },
) {
  const tz = opts.timeZone;
  const yearFilter = opts.year
    ? sql`and extract(year from lr.completed_at at time zone ${tz}) = ${opts.year}`
    : sql``;
  return withUser(database, ctx, async (tx) => {
    const base = sql`from nodinest.learning_records lr
      join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
      left join nodinest.book_details b on b.resource_id = r.id
      left join nodinest.media_details m on m.resource_id = r.id
      where lr.user_id = ${ctx.userId}`;

    const [totals] = await tx.execute<{
      library: number;
      completed: number;
      in_progress: number;
      planned: number;
      paused: number;
      books_read: number;
      courses_done: number;
      media_done: number;
      pages_read: number;
      media_seconds: number;
      lessons_done: number;
      avg_rating: number | null;
      rated: number;
    }>(sql`
      select
        count(*)::int as library,
        count(*) filter (where lr.status = 'completed' ${yearFilter})::int as completed,
        count(*) filter (where lr.status = 'in_progress')::int as in_progress,
        count(*) filter (where lr.status = 'planned')::int as planned,
        count(*) filter (where lr.status in ('paused', 'abandoned'))::int as paused,
        count(*) filter (where lr.status = 'completed' and r.type = 'book' ${yearFilter})::int as books_read,
        count(*) filter (where lr.status = 'completed' and r.type = 'course' ${yearFilter})::int as courses_done,
        count(*) filter (where lr.status = 'completed' and r.type in ('video','lecture','interview','podcast') ${yearFilter})::int as media_done,
        (coalesce(sum(b.page_count) filter (where lr.status = 'completed' and r.type in ('book','course') ${yearFilter}), 0)
          + ${opts.year ? sql`0` : sql`coalesce(sum(lr.progress_current) filter (where lr.status = 'in_progress' and lr.progress_unit = 'pages'), 0)`})::int as pages_read,
        coalesce(sum(m.duration_seconds) filter (where lr.status = 'completed' ${yearFilter}), 0)::int as media_seconds,
        coalesce(sum(lr.progress_total) filter (where lr.status = 'completed' and lr.progress_unit = 'lessons' ${yearFilter}), 0)::int as lessons_done,
        round(avg(lr.rating) filter (where lr.rating is not null ${yearFilter}), 1)::float as avg_rating,
        count(*) filter (where lr.rating is not null ${yearFilter})::int as rated
      ${base}`);

    const byType = await tx.execute<{ type: string; completed: number; total: number }>(sql`
      select r.type::text as type,
        count(*) filter (where lr.status = 'completed' ${yearFilter})::int as completed,
        count(*)::int as total
      ${base} group by 1 order by 3 desc`);

    const byYear = await tx.execute<{ year: number; completed: number; pages: number }>(sql`
      select extract(year from lr.completed_at at time zone ${tz})::int as year,
        count(*)::int as completed,
        coalesce(sum(b.page_count), 0)::int as pages
      ${base} and lr.status = 'completed' and lr.completed_at is not null
      group by 1 order by 1`);

    const byMonth = opts.year
      ? await tx.execute<{ month: number; completed: number }>(sql`
          select extract(month from lr.completed_at at time zone ${tz})::int as month, count(*)::int as completed
          ${base} and lr.status = 'completed' ${yearFilter}
            and coalesce(lr.completed_precision, 'time') <> 'year'
          group by 1 order by 1`)
      : [];

    const ratings = await tx.execute<{ rating: number; n: number }>(sql`
      select lr.rating::int as rating, count(*)::int as n ${base} and lr.rating is not null ${yearFilter}
      group by 1 order by 1`);

    const authors = await tx.execute<{ id: string; name: string; n: number }>(sql`
      select p.id, p.full_name as name, count(distinct lr.resource_id)::int as n
      from nodinest.learning_records lr
      join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
      join nodinest.resource_contributors c on c.resource_id = r.id
      join nodinest.people p on p.id = c.person_id
      where lr.user_id = ${ctx.userId} and lr.status = 'completed' ${yearFilter}
      group by p.id, p.full_name
      order by n desc, name limit 8`);

    const topics = await tx.execute<{
      id: string;
      name_uz: string;
      name_en: string;
      n: number;
    }>(sql`
      select cat.id, cat.name_uz, cat.name_en, count(distinct lr.resource_id)::int as n
      from nodinest.learning_records lr
      join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
      join nodinest.resource_categories rc on rc.resource_id = r.id
      join nodinest.categories cat on cat.id = rc.category_id
      where lr.user_id = ${ctx.userId} and lr.status = 'completed' ${yearFilter}
      group by cat.id, cat.name_uz, cat.name_en
      order by n desc limit 8`);

    const [longest] = await tx.execute<{ id: string; title: string; pages: number }>(sql`
      select r.id, r.title, b.page_count as pages ${base} and lr.status = 'completed' and b.page_count is not null ${yearFilter}
      order by b.page_count desc limit 1`);

    const [best] = await tx.execute<{ id: string; title: string; rating: number }>(sql`
      select r.id, r.title, lr.rating ${base} and lr.rating is not null ${yearFilter}
      order by lr.rating desc, lr.completed_at desc nulls last limit 1`);

    // Fastest finished books: whole calendar days from start to finish (both
    // known to the day), and pages per day where the page count is known.
    const fastest = await tx.execute<{
      id: string;
      title: string;
      days: number;
      pages: number | null;
      per_day: number | null;
    }>(sql`
      with f as (
        select r.id, r.title,
          ((lr.completed_at at time zone ${tz})::date - (lr.started_at at time zone ${tz})::date + 1)::int as days,
          coalesce(b.page_count, case when lr.progress_unit = 'pages' then lr.progress_total end) as pages
        ${base} and lr.status = 'completed' and r.type = 'book'
          and lr.started_at is not null and lr.completed_at is not null
          and coalesce(lr.started_precision, 'time') in ('day', 'time')
          and coalesce(lr.completed_precision, 'time') in ('day', 'time') ${yearFilter}
          -- identical instants were auto-filled by older versions, not read in a day
          and not (lr.started_at = lr.completed_at and coalesce(lr.started_precision, 'time') = 'time')
      )
      select id, title, days, pages, round(pages::numeric / days, 1)::float as per_day
      from f where days >= 1
      order by days, per_day desc nulls last limit 50`);

    const years = byYear.map((y) => y.year);
    return {
      totals: totals ?? {
        library: 0,
        completed: 0,
        in_progress: 0,
        planned: 0,
        paused: 0,
        books_read: 0,
        courses_done: 0,
        media_done: 0,
        pages_read: 0,
        media_seconds: 0,
        lessons_done: 0,
        avg_rating: null,
        rated: 0,
      },
      byType,
      byYear,
      byMonth,
      ratings,
      authors,
      topics,
      fastest,
      longest: longest ?? null,
      best: best ?? null,
      years,
    };
  });
}

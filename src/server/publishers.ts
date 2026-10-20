/**
 * Publishers: shared catalog entries, written once and then picked (like
 * people). Anyone may add one; the creator (or the superadmin in admin mode)
 * may edit it. RLS enforces the same rule (drizzle/0008).
 */
import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { withUser, type AppContext, type Database, type Tx } from "@/db";
import { publishers } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { escapeLike, normalizeText } from "@/lib/normalize";
import { publisherInput, zodFieldErrors } from "@/lib/validation";

export type PublisherHit = { id: string; name: string; city: string | null; books: number };

export async function searchPublishers(tx: Tx | Database, query: string, limit = 8) {
  const q = normalizeText(query);
  if (!q) return [] as PublisherHit[];
  const like = escapeLike(q);
  const rows = await tx.execute<{
    id: string;
    name: string;
    city: string | null;
    books: number;
  }>(sql`
    select p.id, p.name, p.city,
      (select count(*)::int from nodinest.book_details b where b.publisher_id = p.id) as books
    from nodinest.publishers p
    where p.deleted_at is null and (
      nodinest.nn_norm(p.name) like ${"%" + like + "%"}
      or (length(${q}) >= 3 and nodinest.nn_norm(p.name) % ${q}))
    order by (nodinest.nn_norm(p.name) like ${like + "%"}) desc,
      similarity(nodinest.nn_norm(p.name), ${q}) desc, p.name
    limit ${limit}`);
  return rows.map((r) => ({ ...r }));
}

/** Exact (normalised) match or a new publisher owned by the actor. */
export const PUBLISHER_KINDS = [
  "publisher",
  "channel",
  "podcast",
  "website",
  "organization",
] as const;
export type PublisherKind = (typeof PUBLISHER_KINDS)[number];

export async function ensurePublisher(
  tx: Tx,
  ctx: AppContext,
  name: string,
  kind: PublisherKind = "publisher",
): Promise<string> {
  const clean = name.trim().slice(0, 200);
  if (!clean) throw new AppError("VALIDATION", "publisher_required");
  const [found] = await tx.execute<{ id: string }>(sql`
    select id from nodinest.publishers
    where deleted_at is null and nodinest.nn_norm(name) = ${normalizeText(clean)} limit 1`);
  if (found) return found.id;
  const [row] = await tx
    .insert(publishers)
    .values({ name: clean, kind, createdBy: ctx.userId })
    .returning({ id: publishers.id });
  return row.id;
}

export async function canEditPublisher(tx: Tx | Database, ctx: AppContext, id: string) {
  if (ctx.role === "superadmin") return true;
  const [p] = await tx
    .select({ createdBy: publishers.createdBy })
    .from(publishers)
    .where(eq(publishers.id, id));
  return !!p && p.createdBy === ctx.userId;
}

export async function getPublisherDetail(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const [[p], items, [mine], canEdit] = await Promise.all([
      tx
        .select()
        .from(publishers)
        .where(and(eq(publishers.id, id), isNull(publishers.deletedAt))),
      tx.execute<{
        id: string;
        title: string;
        type: string;
        cover_url: string | null;
        cover_file_id: string | null;
        publication_date: string | null;
        authors: string | null;
        my_status: string | null;
      }>(sql`
        select r.id, r.title, r.type::text as type, r.cover_url, r.cover_file_id, r.publication_date,
          (select string_agg(pp.full_name, ', ' order by c.position)
             from nodinest.resource_contributors c join nodinest.people pp on pp.id = c.person_id
            where c.resource_id = r.id) as authors,
          (select lr.status::text from nodinest.learning_records lr
            where lr.resource_id = r.id and lr.user_id = ${ctx.userId}) as my_status
        from nodinest.resources r
        where r.deleted_at is null and (
          exists (select 1 from nodinest.book_details b where b.resource_id = r.id and b.publisher_id = ${id})
          or exists (select 1 from nodinest.media_details m where m.resource_id = r.id and m.publisher_id = ${id}))
        order by r.publication_date desc nulls last, r.title`),
      // What I learned from it.
      tx.execute<{
        in_library: number;
        completed: number;
        in_progress: number;
        seconds: number;
        pages: number;
        notes: number;
        quotes: number;
        words: number;
      }>(sql`
        with mine as (
          select r.id, lr.status, b.page_count, m.duration_seconds
          from nodinest.resources r
          join nodinest.learning_records lr on lr.resource_id = r.id and lr.user_id = ${ctx.userId}
          left join nodinest.book_details b on b.resource_id = r.id
          left join nodinest.media_details m on m.resource_id = r.id
          where r.deleted_at is null and (b.publisher_id = ${id} or m.publisher_id = ${id}))
        select count(*)::int as in_library,
          count(*) filter (where status = 'completed')::int as completed,
          count(*) filter (where status = 'in_progress')::int as in_progress,
          coalesce(sum(duration_seconds) filter (where status = 'completed'), 0)::int as seconds,
          coalesce(sum(page_count) filter (where status = 'completed'), 0)::int as pages,
          (select count(*)::int from nodinest.notes n where n.user_id = ${ctx.userId}
             and n.deleted_at is null and n.kind = 'note' and n.resource_id in (select id from mine)) as notes,
          (select count(*)::int from nodinest.notes n where n.user_id = ${ctx.userId}
             and n.deleted_at is null and n.kind = 'quote' and n.resource_id in (select id from mine)) as quotes,
          (select coalesce(sum(w.words), 0)::int from nodinest.writeups w where w.user_id = ${ctx.userId}
             and w.resource_id in (select id from mine)) as words
        from mine`),
      canEditPublisher(tx, ctx, id),
    ]);
    if (!p) return null;
    return { publisher: p, items: items.map((b) => ({ ...b })), mine, canEdit };
  });
}

export async function listPublishers(database: Database, ctx: AppContext) {
  return withUser(database, ctx, async (tx) =>
    (
      await tx.execute<{
        id: string;
        name: string;
        city: string | null;
        kind: string;
        books: number;
        learned: number;
      }>(sql`
        with items as (
          select b.publisher_id as pid, r.id from nodinest.book_details b
            join nodinest.resources r on r.id = b.resource_id and r.deleted_at is null
          union all
          select m.publisher_id, r.id from nodinest.media_details m
            join nodinest.resources r on r.id = m.resource_id and r.deleted_at is null)
        select p.id, p.name, p.city, p.kind,
          (select count(*)::int from items i where i.pid = p.id) as books,
          (select count(*)::int from items i join nodinest.learning_records lr
             on lr.resource_id = i.id and lr.user_id = ${ctx.userId} and lr.status = 'completed'
           where i.pid = p.id) as learned
        from nodinest.publishers p where p.deleted_at is null
        order by learned desc, books desc, p.name limit 500`)
    ).map((r) => ({ ...r })),
  );
}

export async function savePublisher(
  database: Database,
  ctx: AppContext,
  raw: unknown,
  id?: string,
): Promise<string> {
  const parsed = publisherInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_publisher", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  const d = parsed.data;
  return withUser(database, ctx, async (tx) => {
    const [dup] = await tx.execute<{ id: string }>(sql`
      select id from nodinest.publishers where deleted_at is null
        and nodinest.nn_norm(name) = ${normalizeText(d.name)}
        ${id ? sql`and id <> ${id}` : sql``} limit 1`);
    if (dup)
      throw new AppError("DUPLICATE", "publisher_exists", {
        candidates: [{ id: dup.id, label: d.name, reason: "same_name" }],
      });
    if (!id) {
      const [row] = await tx
        .insert(publishers)
        .values({ ...d, createdBy: ctx.userId })
        .returning({ id: publishers.id });
      return row.id;
    }
    if (!(await canEditPublisher(tx, ctx, id))) throw new AppError("FORBIDDEN");
    await tx
      .update(publishers)
      .set({ ...d, updatedAt: new Date() })
      .where(eq(publishers.id, id));
    return id;
  });
}

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
export async function ensurePublisher(tx: Tx, ctx: AppContext, name: string): Promise<string> {
  const clean = name.trim().slice(0, 200);
  if (!clean) throw new AppError("VALIDATION", "publisher_required");
  const [found] = await tx.execute<{ id: string }>(sql`
    select id from nodinest.publishers
    where deleted_at is null and nodinest.nn_norm(name) = ${normalizeText(clean)} limit 1`);
  if (found) return found.id;
  const [row] = await tx
    .insert(publishers)
    .values({ name: clean, createdBy: ctx.userId })
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
    const [[p], books, canEdit] = await Promise.all([
      tx
        .select()
        .from(publishers)
        .where(and(eq(publishers.id, id), isNull(publishers.deletedAt))),
      tx.execute<{
        id: string;
        title: string;
        type: "book";
        cover_url: string | null;
        cover_file_id: string | null;
        publication_date: string | null;
        authors: string | null;
        my_status: string | null;
      }>(sql`
        select r.id, r.title, r.type, r.cover_url, r.cover_file_id, r.publication_date,
          (select string_agg(pp.full_name, ', ' order by c.position)
             from nodinest.resource_contributors c join nodinest.people pp on pp.id = c.person_id
            where c.resource_id = r.id and c.role = 'author') as authors,
          (select lr.status::text from nodinest.learning_records lr
            where lr.resource_id = r.id and lr.user_id = ${ctx.userId}) as my_status
        from nodinest.book_details b join nodinest.resources r on r.id = b.resource_id
        where b.publisher_id = ${id} and r.deleted_at is null
        order by r.publication_date desc nulls last, r.title`),
      canEditPublisher(tx, ctx, id),
    ]);
    if (!p) return null;
    return { publisher: p, books: books.map((b) => ({ ...b })), canEdit };
  });
}

export async function listPublishers(database: Database, ctx: AppContext) {
  return withUser(database, ctx, async (tx) =>
    (
      await tx.execute<{ id: string; name: string; city: string | null; books: number }>(sql`
        select p.id, p.name, p.city,
          (select count(*)::int from nodinest.book_details b
             join nodinest.resources r on r.id = b.resource_id
            where b.publisher_id = p.id and r.deleted_at is null) as books
        from nodinest.publishers p where p.deleted_at is null
        order by books desc, p.name limit 500`)
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

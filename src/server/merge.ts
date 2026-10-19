/**
 * Duplicate clean-up for the user's library.
 *
 * mergeResources: everything the USER attached to the duplicates (reading
 * record, notes, taqriz, collection places, indexed book text) moves to the
 * kept entry; duplicates the user may edit (their own entries, or admin mode)
 * are archived, others are only detached from the user. Nothing is hard-deleted.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db, withUser, type AppContext } from "@/db";
import { AppError } from "@/lib/errors";
import { duplicateKey } from "@/lib/normalize";
import { sanitizeDoc, type WriteupDoc } from "@/lib/writeup-doc";
import { applyArchive, canEditCatalog } from "./catalog";

export type MergeResult = { keptId: string; merged: number; archived: number; detached: number };

export async function mergeResources(
  ctx: AppContext,
  keepId: string,
  removeIds: string[],
): Promise<MergeResult> {
  const remove = [...new Set(removeIds)].filter((id) => id !== keepId);
  if (!remove.length) throw new AppError("VALIDATION", "nothing_to_merge");
  return withUser(db, ctx, async (tx) => {
    const [keep] = await tx.execute<{ id: string }>(
      sql`select id from nodinest.resources where id = ${keepId} and deleted_at is null`,
    );
    if (!keep) throw new AppError("NOT_FOUND");
    let archived = 0;
    let detached = 0;
    for (const rid of remove) {
      const uid = ctx.userId;
      // Reading record: keep the richer one (completed > in progress > …, rating, dates).
      const recs = await tx.execute<{
        id: string;
        resource_id: string;
        status: string;
        rating: number | null;
        review: string | null;
        started_at: Date | null;
        completed_at: Date | null;
        started_precision: string | null;
        completed_precision: string | null;
      }>(sql`
        select id, resource_id, status::text, rating, review, started_at, completed_at,
          started_precision, completed_precision
        from nodinest.learning_records where user_id = ${uid} and resource_id in (${keepId}, ${rid})`);
      const kRec = recs.find((r) => r.resource_id === keepId);
      const dRec = recs.find((r) => r.resource_id === rid);
      if (dRec && !kRec) {
        await tx.execute(
          sql`update nodinest.learning_records set resource_id = ${keepId}, updated_at = now() where id = ${dRec.id}`,
        );
      } else if (dRec && kRec) {
        const rank = (s: string) =>
          ({ completed: 4, in_progress: 3, paused: 2, abandoned: 2, planned: 1 })[s] ?? 0;
        const best = rank(dRec.status) > rank(kRec.status) ? dRec.status : kRec.status;
        await tx.execute(sql`
          update nodinest.learning_records set
            status = ${best}::nodinest.learning_status,
            rating = coalesce(rating, ${dRec.rating}),
            review = coalesce(review, ${dRec.review}),
            started_precision = case when ${dRec.started_at}::timestamptz is not null
              and (started_at is null or ${dRec.started_at}::timestamptz < started_at)
              then ${dRec.started_precision} else started_precision end,
            completed_precision = case when ${dRec.completed_at}::timestamptz is not null
              and (completed_at is null or ${dRec.completed_at}::timestamptz > completed_at)
              then ${dRec.completed_precision} else completed_precision end,
            started_at = least(coalesce(started_at, ${dRec.started_at}), coalesce(${dRec.started_at}, started_at)),
            completed_at = greatest(coalesce(completed_at, ${dRec.completed_at}), coalesce(${dRec.completed_at}, completed_at)),
            updated_at = now()
          where id = ${kRec.id}`);
        await tx.execute(sql`delete from nodinest.learning_records where id = ${dRec.id}`);
      }
      await tx.execute(
        sql`update nodinest.notes set resource_id = ${keepId} where user_id = ${uid} and resource_id = ${rid}`,
      );
      // Taqriz: move, or append the duplicate's text below the kept one.
      const ws = await tx.execute<{ id: string; resource_id: string; doc: unknown }>(sql`
        select id, resource_id, doc from nodinest.writeups where user_id = ${uid} and resource_id in (${keepId}, ${rid})`);
      const kW = ws.find((w) => w.resource_id === keepId);
      const dW = ws.find((w) => w.resource_id === rid);
      if (dW && !kW) {
        await tx.execute(
          sql`update nodinest.writeups set resource_id = ${keepId} where id = ${dW.id}`,
        );
      } else if (dW && kW) {
        const a = sanitizeDoc(kW.doc) as WriteupDoc;
        const b = sanitizeDoc(dW.doc) as WriteupDoc;
        const merged = {
          type: "doc",
          content: [...a.content, { type: "horizontalRule" }, ...b.content],
        };
        await tx.execute(
          sql`update nodinest.writeups set doc = ${JSON.stringify(merged)}::jsonb, updated_at = now() where id = ${kW.id}`,
        );
        await tx.execute(sql`delete from nodinest.writeups where id = ${dW.id}`);
      }
      // Collections: take the duplicate's place unless the kept entry is already there.
      await tx.execute(sql`
        delete from nodinest.collection_items d using nodinest.collection_items k
        where d.user_id = ${uid} and d.resource_id = ${rid} and k.collection_id = d.collection_id and k.resource_id = ${keepId}`);
      await tx.execute(
        sql`update nodinest.collection_items set resource_id = ${keepId} where user_id = ${uid} and resource_id = ${rid}`,
      );
      await tx.execute(
        sql`update nodinest.book_text_sources set resource_id = ${keepId} where user_id = ${uid} and resource_id = ${rid}`,
      );
      await tx.execute(
        sql`update nodinest.book_pages set resource_id = ${keepId} where user_id = ${uid} and resource_id = ${rid}`,
      );
      await tx.execute(
        sql`update nodinest.files set resource_id = ${keepId} where owner_id = ${uid} and resource_id = ${rid}`,
      );
      if (await canEditCatalog(tx, ctx, "resource", rid)) {
        await applyArchive(tx, ctx, "resource", rid, true, { mergedInto: keepId });
        archived++;
      } else detached++;
    }
    return { keptId: keepId, merged: remove.length, archived, detached };
  });
}

export type DuplicateGroup = {
  key: string;
  items: {
    id: string;
    title: string;
    type: string;
    authors: string | null;
    status: string | null;
    createdAt: Date;
    score: number;
  }[];
};

/** Likely duplicates among the books in the user's library (same normalised title or very similar). */
export async function findLibraryDuplicates(ctx: AppContext): Promise<DuplicateGroup[]> {
  return withUser(db, ctx, async (tx) => {
    const rows = await tx.execute<{ a: string; b: string; score: number }>(sql`
      with mine as (
        select r.id, r.title, r.type from nodinest.resources r
        where r.deleted_at is null and (
          exists (select 1 from nodinest.learning_records lr where lr.resource_id = r.id and lr.user_id = ${ctx.userId})
          or r.created_by = ${ctx.userId})
      )
      select a.id as a, b.id as b, similarity(nodinest.nn_norm(a.title), nodinest.nn_norm(b.title)) as score
      from mine a join mine b on a.id < b.id and a.type = b.type
      where nodinest.nn_norm(a.title) % nodinest.nn_norm(b.title)
        and similarity(nodinest.nn_norm(a.title), nodinest.nn_norm(b.title)) >= 0.6`);
    if (!rows.length) return [];
    // Union-find into groups.
    const parent = new Map<string, string>();
    const find = (x: string): string => ((parent.get(x) ?? x) === x ? x : find(parent.get(x)!));
    for (const r of rows) {
      parent.set(r.a, parent.get(r.a) ?? r.a);
      parent.set(r.b, parent.get(r.b) ?? r.b);
      parent.set(find(r.b), find(r.a));
    }
    const ids = [...parent.keys()];
    const info = await tx.execute<{
      id: string;
      title: string;
      type: string;
      authors: string | null;
      status: string | null;
      created_at: Date;
    }>(sql`
      select r.id, r.title, r.type::text,
        (select string_agg(p.full_name, ', ' order by c.position) from nodinest.resource_contributors c
           join nodinest.people p on p.id = c.person_id where c.resource_id = r.id) as authors,
        (select lr.status::text from nodinest.learning_records lr where lr.resource_id = r.id and lr.user_id = ${ctx.userId}) as status,
        r.created_at
      from nodinest.resources r where r.id in (${sql.join(
        ids.map((i) => sql`${i}::uuid`),
        sql`, `,
      )})`);
    const score = new Map<string, number>();
    for (const r of rows) {
      score.set(r.a, Math.max(score.get(r.a) ?? 0, Number(r.score)));
      score.set(r.b, Math.max(score.get(r.b) ?? 0, Number(r.score)));
    }
    const groups = new Map<string, DuplicateGroup>();
    for (const i of info) {
      const root = find(i.id);
      const g = groups.get(root) ?? { key: duplicateKey(i.title), items: [] };
      g.items.push({
        id: i.id,
        title: i.title,
        type: i.type,
        authors: i.authors,
        status: i.status,
        createdAt: new Date(i.created_at),
        score: score.get(i.id) ?? 0,
      });
      groups.set(root, g);
    }
    return [...groups.values()]
      .map((g) => ({
        ...g,
        items: g.items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      }))
      .filter((g) => g.items.length > 1);
  });
}

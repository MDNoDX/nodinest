/**
 * Personal notes & quotations, private tags and collections.
 * Private by default; RLS + explicit owner filters on every query.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { withUser, type AppContext, type Database, type Tx } from "@/db/client";
import {
  collectionItems,
  collections,
  noteTags,
  notes,
  people,
  resources,
  tags,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { normalizeTag } from "@/lib/normalize";
import { collectionInput, noteInput, zodFieldErrors } from "@/lib/validation";

async function ensurePersonalTags(tx: Tx, ctx: AppContext, names: string[]) {
  const ids: string[] = [];
  for (const name of names) {
    const normalized = normalizeTag(name);
    if (!normalized) continue;
    const [row] = await tx
      .insert(tags)
      .values({ ownerId: ctx.userId, name: name.trim(), normalized })
      .onConflictDoUpdate({ target: [tags.ownerId, tags.normalized], set: { normalized } })
      .returning({ id: tags.id });
    ids.push(row.id);
  }
  return [...new Set(ids)];
}

async function assertRefs(
  tx: Tx,
  ctx: AppContext,
  d: { resourceId?: string | null; personId?: string | null },
) {
  if (d.resourceId) {
    const [r] = await tx
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.id, d.resourceId));
    if (!r)
      throw new AppError("VALIDATION", "unknown_resource", {
        fieldErrors: { resourceId: ["not_found"] },
      });
  }
  if (d.personId) {
    const [p] = await tx.select({ id: people.id }).from(people).where(eq(people.id, d.personId));
    if (!p)
      throw new AppError("VALIDATION", "unknown_person", {
        fieldErrors: { personId: ["not_found"] },
      });
  }
}

export async function saveNote(database: Database, ctx: AppContext, raw: unknown, id?: string) {
  const parsed = noteInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_note", { fieldErrors: zodFieldErrors(parsed.error) });
  const d = parsed.data;
  return withUser(database, ctx, async (tx) => {
    await assertRefs(tx, ctx, d);
    const values = {
      kind: d.kind,
      title: d.title,
      body: d.body,
      quoteText: d.kind === "quote" ? d.quoteText : null,
      resourceId: d.resourceId ?? null,
      personId: d.personId ?? null,
      pageFrom: d.pageFrom,
      pageTo: d.pageTo,
      location: d.location,
      timestampSeconds: d.timestampSeconds,
      visibility: d.visibility,
      verification: d.verification,
    };
    let noteId = id;
    if (id) {
      const res = await tx
        .update(notes)
        .set(values)
        .where(and(eq(notes.id, id), eq(notes.userId, ctx.userId), isNull(notes.deletedAt)))
        .returning({ id: notes.id });
      if (res.length === 0) throw new AppError("NOT_FOUND");
    } else {
      const [row] = await tx
        .insert(notes)
        .values({ ...values, userId: ctx.userId })
        .returning({ id: notes.id });
      noteId = row.id;
    }
    await tx.delete(noteTags).where(eq(noteTags.noteId, noteId!));
    const tagIds = await ensurePersonalTags(tx, ctx, d.tags);
    if (tagIds.length)
      await tx.insert(noteTags).values(tagIds.map((tagId) => ({ noteId: noteId!, tagId })));
    return noteId!;
  });
}

export async function deleteNote(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .update(notes)
      .set({ deletedAt: new Date() })
      .where(and(eq(notes.id, id), eq(notes.userId, ctx.userId), isNull(notes.deletedAt)))
      .returning({ id: notes.id });
    if (res.length === 0) throw new AppError("NOT_FOUND");
  });
}

export async function restoreNote(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .update(notes)
      .set({ deletedAt: null })
      .where(and(eq(notes.id, id), eq(notes.userId, ctx.userId)))
      .returning({ id: notes.id });
    if (res.length === 0) throw new AppError("NOT_FOUND");
  });
}

/**
 * Returns a note if the actor may read it: their own (any visibility) or
 * someone else's PUBLIC note. Private notes of others → null (404, not 403,
 * so existence isn't leaked).
 */
export async function getNote(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const [n] = await tx
      .select({
        note: notes,
        resourceTitle: resources.title,
        personName: people.fullName,
      })
      .from(notes)
      .leftJoin(resources, eq(resources.id, notes.resourceId))
      .leftJoin(people, eq(people.id, notes.personId))
      .where(
        and(
          eq(notes.id, id),
          sql`(${notes.userId} = ${ctx.userId} or (${notes.visibility} = 'public' and ${notes.deletedAt} is null))`,
        ),
      );
    if (!n) return null;
    const isOwner = n.note.userId === ctx.userId;
    const tagRows = isOwner
      ? await tx
          .select({ id: tags.id, name: tags.name })
          .from(noteTags)
          .innerJoin(tags, eq(tags.id, noteTags.tagId))
          .where(eq(noteTags.noteId, id))
      : [];
    return { ...n, isOwner, tags: tagRows };
  });
}

export async function listNotes(
  database: Database,
  ctx: AppContext,
  f: {
    kind?: "note" | "quote" | null;
    resourceId?: string | null;
    tag?: string | null;
    trash?: boolean;
    page?: number;
  },
) {
  const pageSize = 30;
  const page = Math.max(1, f.page ?? 1);
  return withUser(database, ctx, async (tx) => {
    const rows = await tx
      .select({
        id: notes.id,
        kind: notes.kind,
        title: notes.title,
        body: notes.body,
        quoteText: notes.quoteText,
        pageFrom: notes.pageFrom,
        pageTo: notes.pageTo,
        location: notes.location,
        visibility: notes.visibility,
        verification: notes.verification,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        resourceId: notes.resourceId,
        resourceTitle: resources.title,
        resourceType: resources.type,
        personId: notes.personId,
        personName: people.fullName,
        tagNames: sql<
          string[]
        >`coalesce((select array_agg(t.name order by t.name) from nodinest.note_tags nt
          join nodinest.tags t on t.id = nt.tag_id where nt.note_id = "notes"."id"), '{}')`,
        total: sql<number>`count(*) over()`,
      })
      .from(notes)
      .leftJoin(resources, eq(resources.id, notes.resourceId))
      .leftJoin(people, eq(people.id, notes.personId))
      .where(
        and(
          eq(notes.userId, ctx.userId),
          f.trash ? sql`${notes.deletedAt} is not null` : isNull(notes.deletedAt),
          f.kind ? eq(notes.kind, f.kind) : undefined,
          f.resourceId ? eq(notes.resourceId, f.resourceId) : undefined,
          f.tag
            ? sql`exists (select 1 from nodinest.note_tags nt join nodinest.tags t on t.id = nt.tag_id
                where nt.note_id = "notes"."id" and t.normalized = ${normalizeTag(f.tag)} and t.owner_id = ${ctx.userId})`
            : undefined,
        ),
      )
      .orderBy(desc(notes.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { items: rows, total: Number(rows[0]?.total ?? 0), page, pageSize };
  });
}

export async function listMyTags(database: Database, ctx: AppContext) {
  return withUser(database, ctx, (tx) =>
    tx
      .select({
        id: tags.id,
        name: tags.name,
        normalized: tags.normalized,
        count: sql<number>`(select count(*)::int from nodinest.note_tags nt join nodinest.notes n on n.id = nt.note_id
          where nt.tag_id = "tags"."id" and n.deleted_at is null)`,
      })
      .from(tags)
      .where(eq(tags.ownerId, ctx.userId))
      .orderBy(asc(tags.name)),
  );
}

// ─── Collections ────────────────────────────────────────────────────────────

export async function listCollections(database: Database, ctx: AppContext) {
  return withUser(database, ctx, (tx) =>
    tx
      .select({
        id: collections.id,
        systemKey: collections.systemKey,
        name: collections.name,
        description: collections.description,
        ranked: collections.ranked,
        count: sql<number>`(select count(*)::int from nodinest.collection_items ci where ci.collection_id = "collections"."id")`,
      })
      .from(collections)
      .where(eq(collections.userId, ctx.userId))
      .orderBy(asc(collections.sortOrder), asc(collections.createdAt)),
  );
}

export async function saveCollection(
  database: Database,
  ctx: AppContext,
  raw: unknown,
  id?: string,
) {
  const parsed = collectionInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_collection", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  return withUser(database, ctx, async (tx) => {
    if (id) {
      const res = await tx
        .update(collections)
        .set(parsed.data)
        .where(and(eq(collections.id, id), eq(collections.userId, ctx.userId)))
        .returning({ id: collections.id });
      if (res.length === 0) throw new AppError("NOT_FOUND");
      return id;
    }
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${collections.sortOrder}), 0)` })
      .from(collections)
      .where(eq(collections.userId, ctx.userId));
    const [row] = await tx
      .insert(collections)
      .values({ ...parsed.data, userId: ctx.userId, sortOrder: Number(max) + 1 })
      .returning({ id: collections.id });
    return row.id;
  });
}

export async function deleteCollection(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .delete(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, ctx.userId)))
      .returning({ id: collections.id });
    if (res.length === 0) throw new AppError("NOT_FOUND");
  });
}

export async function getCollection(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const [c] = await tx
      .select()
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, ctx.userId)));
    if (!c) return null;
    const items = await tx
      .select({
        id: collectionItems.id,
        addedAt: collectionItems.addedAt,
        resourceId: resources.id,
        resourceTitle: resources.title,
        resourceType: resources.type,
        coverUrl: resources.coverUrl,
        coverFileId: resources.coverFileId,
        description: resources.description,
        originalDate: resources.originalDate,
        publicationDate: resources.publicationDate,
        pageCount: sql<
          number | null
        >`(select b.page_count from nodinest.book_details b where b.resource_id = "collection_items"."resource_id")`,
        durationSeconds: sql<
          number | null
        >`(select m.duration_seconds from nodinest.media_details m where m.resource_id = "collection_items"."resource_id")`,
        lessonCount: sql<
          number | null
        >`(select m.lesson_count from nodinest.media_details m where m.resource_id = "collection_items"."resource_id")`,
        myStatus: sql<string | null>`(select lr.status::text from nodinest.learning_records lr
          where lr.user_id = ${ctx.userId} and lr.resource_id = "collection_items"."resource_id")`,
        noteId: notes.id,
        noteKind: notes.kind,
        noteTitle: notes.title,
        quoteText: notes.quoteText,
        noteBody: notes.body,
        position: collectionItems.position,
        authors: sql<string | null>`(select string_agg(p.full_name, ', ' order by c.position)
          from nodinest.resource_contributors c join nodinest.people p on p.id = c.person_id
          where c.resource_id = "collection_items"."resource_id")`,
        myRating: sql<number | null>`(select lr.rating from nodinest.learning_records lr
          where lr.user_id = ${ctx.userId} and lr.resource_id = "collection_items"."resource_id")`,
      })
      .from(collectionItems)
      .leftJoin(resources, eq(resources.id, collectionItems.resourceId))
      .leftJoin(notes, and(eq(notes.id, collectionItems.noteId), isNull(notes.deletedAt)))
      .where(eq(collectionItems.collectionId, id))
      .orderBy(
        c.ranked ? asc(collectionItems.position) : desc(collectionItems.addedAt),
        asc(collectionItems.addedAt),
      );
    return { collection: c, items };
  });
}

export async function toggleCollectionItem(
  database: Database,
  ctx: AppContext,
  collectionId: string,
  target: { resourceId?: string; noteId?: string },
  add: boolean,
) {
  if (!!target.resourceId === !!target.noteId) throw new AppError("VALIDATION", "one_target");
  return withUser(database, ctx, async (tx) => {
    const [c] = await tx
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, ctx.userId)));
    if (!c) throw new AppError("NOT_FOUND");
    const match = target.resourceId
      ? eq(collectionItems.resourceId, target.resourceId)
      : eq(collectionItems.noteId, target.noteId!);
    if (add) {
      // New items go to the end of a ranked list.
      const [{ max }] = await tx
        .select({ max: sql<number>`coalesce(max(${collectionItems.position}), 0)` })
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, collectionId));
      await tx
        .insert(collectionItems)
        .values({
          collectionId,
          userId: ctx.userId,
          resourceId: target.resourceId ?? null,
          noteId: target.noteId ?? null,
          position: Number(max) + 1,
        })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(collectionItems)
        .where(and(eq(collectionItems.collectionId, collectionId), match));
    }
  });
}

/** Saves a ranked order (#1 first). All ids must belong to the collection. */
export async function reorderCollection(
  database: Database,
  ctx: AppContext,
  collectionId: string,
  itemIds: string[],
) {
  return withUser(database, ctx, async (tx) => {
    const items = await tx
      .select({ id: collectionItems.id })
      .from(collectionItems)
      .where(
        and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.userId, ctx.userId)),
      );
    const set = new Set(items.map((i) => i.id));
    if (itemIds.length !== set.size || itemIds.some((i) => !set.has(i)))
      throw new AppError("VALIDATION", "order_mismatch");
    for (let i = 0; i < itemIds.length; i++)
      await tx
        .update(collectionItems)
        .set({ position: i + 1 })
        .where(eq(collectionItems.id, itemIds[i]));
  });
}

export async function collectionsContaining(
  database: Database,
  ctx: AppContext,
  target: { resourceId?: string; noteId?: string },
) {
  return withUser(database, ctx, async (tx) => {
    const rows = await tx
      .select({ collectionId: collectionItems.collectionId })
      .from(collectionItems)
      .where(
        and(
          eq(collectionItems.userId, ctx.userId),
          target.resourceId
            ? eq(collectionItems.resourceId, target.resourceId)
            : eq(collectionItems.noteId, target.noteId!),
        ),
      );
    return rows.map((r) => r.collectionId);
  });
}

export async function notesByIds(database: Database, ctx: AppContext, ids: string[]) {
  if (!ids.length) return [];
  return withUser(database, ctx, (tx) =>
    tx
      .select()
      .from(notes)
      .where(and(inArray(notes.id, ids), eq(notes.userId, ctx.userId))),
  );
}

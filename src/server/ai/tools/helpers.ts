import { parseReadingDate } from "@/lib/reading-date";
import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { collections } from "@/db/schema";
import { isValidPartialDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { normalizeText } from "@/lib/normalize";
import { getResourceSnapshot } from "../../catalog";
import { reorderCollection, saveCollection } from "../../notes";
import type { AiToolName } from "../../settings";
import { submitResource } from "../../suggestions";

export const uuid = z.string().uuid();
export const partialDate = z.string().trim().refine(isValidPartialDate, "invalid_partial_date");
export const dateTime = z
  .string()
  .trim()
  .max(40)
  .refine((v) => parseReadingDate(v) !== null, "INVALID_DATE");

export type ToolEnv = { timeZone: string; locale: string };
export type Mode = "read" | "act" | "confirm";

export type ToolDef<S extends z.ZodTypeAny> = {
  perm: AiToolName;
  mode: Mode;
  description: string;
  parameters: Record<string, unknown>;
  args: S;
  run: (ctx: AppContext, a: z.infer<S>, env: ToolEnv) => Promise<unknown>;
  /** What the confirmation card shows before anything changes. */
  preview?: (ctx: AppContext, a: z.infer<S>) => Promise<Record<string, unknown>>;
};

export const str = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "string",
  description,
  ...extra,
});
export const int = (description: string) => ({ type: "integer", description });
export const bool = (description: string) => ({ type: "boolean", description });
export const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});
export const arr = (items: Record<string, unknown>, description?: string) => ({
  type: "array",
  items,
  ...(description ? { description } : {}),
});

export function def<S extends z.ZodTypeAny>(d: ToolDef<S>) {
  return d;
}

/** Resolves a resource by id or by (fuzzy) title; the user's own library first. */
export async function resolveResource(
  ctx: AppContext,
  ref: { resourceId?: string; title?: string },
) {
  if (ref.resourceId) return ref.resourceId;
  if (!ref.title) throw new AppError("VALIDATION", "resource_required");
  const t = normalizeText(ref.title);
  const rows = await withUser(db, ctx, (tx) =>
    tx.execute<{ id: string }>(sql`
      select r.id from nodinest.resources r
      left join nodinest.learning_records lr on lr.resource_id = r.id and lr.user_id = ${ctx.userId}
      where r.deleted_at is null and (nodinest.nn_norm(r.title) = ${t} or nodinest.nn_norm(r.title) % ${t}
        or nodinest.nn_norm(r.title) like ${`%${t.replace(/[\\%_]/g, "")}%`})
      order by (nodinest.nn_norm(r.title) = ${t}) desc, (lr.id is not null) desc,
        similarity(nodinest.nn_norm(r.title), ${t}) desc
      limit 1`),
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", `resource_not_found: ${ref.title}`);
  return rows[0].id;
}

/** Card data for resources shown on a confirmation: cover, authors, year, the user's status. */
export async function describeResources(
  ctx: AppContext,
  list: { id: string; score: number; reason: string }[],
) {
  if (!list.length) return [];
  const rows = await withUser(db, ctx, (tx) =>
    tx.execute<{
      id: string;
      title: string;
      type: string;
      cover_url: string | null;
      cover_file_id: string | null;
      authors: string | null;
      year: string | null;
      my_status: string | null;
      mine: boolean;
    }>(sql`
      select r.id, r.title, r.type::text, r.cover_url, r.cover_file_id,
        (select string_agg(p.full_name, ', ' order by c.position) from nodinest.resource_contributors c
           join nodinest.people p on p.id = c.person_id where c.resource_id = r.id) as authors,
        coalesce(r.original_date, r.publication_date) as year,
        (select lr.status::text from nodinest.learning_records lr where lr.resource_id = r.id and lr.user_id = ${ctx.userId}) as my_status,
        r.created_by = ${ctx.userId} as mine
      from nodinest.resources r
      where r.id in (${sql.join(
        list.map((d) => sql`${d.id}::uuid`),
        sql`, `,
      )})`),
  );
  return list
    .map((d) => {
      const r = rows.find((x) => x.id === d.id);
      return r
        ? {
            id: r.id,
            title: r.title,
            type: r.type,
            cover: r.cover_file_id ? `/api/files/${r.cover_file_id}` : r.cover_url,
            authors: r.authors,
            year: r.year,
            myStatus: r.my_status,
            mine: r.mine,
            reason: d.reason,
            score: Math.round(d.score * 100) / 100,
          }
        : null;
    })
    .filter(Boolean);
}

export async function resolveCollection(
  ctx: AppContext,
  ref: { collectionId?: string; collectionName?: string },
  create?: { ranked?: boolean },
) {
  if (ref.collectionId) return ref.collectionId;
  if (!ref.collectionName) throw new AppError("VALIDATION", "collection_required");
  const [c] = await withUser(db, ctx, (tx) =>
    tx
      .select({ id: collections.id })
      .from(collections)
      .where(
        and(
          eq(collections.userId, ctx.userId),
          ilike(collections.name, ref.collectionName!.trim()),
        ),
      ),
  );
  if (c) return c.id;
  if (!create) throw new AppError("NOT_FOUND", `collection_not_found: ${ref.collectionName}`);
  return saveCollection(db, ctx, { name: ref.collectionName, ranked: !!create.ranked });
}

export async function moveToRank(
  ctx: AppContext,
  collectionId: string,
  resourceId: string,
  rank: number,
) {
  const items = await withUser(db, ctx, (tx) =>
    tx.execute<{ id: string; resource_id: string | null }>(sql`
      select id, resource_id from nodinest.collection_items
      where collection_id = ${collectionId} and user_id = ${ctx.userId} order by position asc, created_at asc`),
  );
  const mine = items.find((i) => i.resource_id === resourceId);
  if (!mine) throw new AppError("NOT_FOUND");
  const rest = items.map((i) => i.id).filter((i) => i !== mine.id);
  rest.splice(Math.min(rank - 1, rest.length), 0, mine.id);
  await withUser(db, ctx, (tx) =>
    tx.update(collections).set({ ranked: true }).where(eq(collections.id, collectionId)),
  );
  await reorderCollection(db, ctx, collectionId, rest);
}

export const resourceRef = {
  resourceId: str("Resource UUID (preferred)"),
  title: str("Or the resource title if the id is unknown"),
};
export const resourceRefSchema = {
  resourceId: uuid.optional(),
  title: z.string().trim().max(400).optional(),
};

export async function updateResourceFields(
  ctx: AppContext,
  id: string,
  c: {
    title?: string;
    originalTitle?: string;
    description?: string;
    originalDate?: string;
    editionDate?: string;
    coverUrl?: string;
    sourceUrl?: string;
    language?: string;
    publisher?: string;
    pageCount?: number;
    readingUrl?: string;
    durationMinutes?: number;
    channel?: string;
    lessonCount?: number;
  },
) {
  const snap = await withUser(db, ctx, (tx) => getResourceSnapshot(tx, id));
  if (!snap) throw new AppError("NOT_FOUND");
  const wantsBook = !!(snap.book || c.publisher || c.pageCount || c.readingUrl);
  const wantsMedia = !!(snap.media || c.durationMinutes || c.channel || c.lessonCount);
  const next = {
    ...snap,
    title: c.title ?? snap.title,
    originalTitle: c.originalTitle ?? snap.originalTitle,
    description: c.description ?? snap.description,
    originalDate: c.originalDate ?? snap.originalDate,
    publicationDate: c.editionDate ?? snap.publicationDate,
    coverUrl: c.coverUrl ?? snap.coverUrl,
    coverFileId: c.coverUrl ? null : snap.coverFileId,
    sourceUrl: c.sourceUrl ?? snap.sourceUrl,
    language: c.language ?? snap.language,
    book: wantsBook
      ? {
          ...(snap.book ?? {}),
          publisherId: c.publisher ? null : snap.book?.publisherId,
          publisherName: c.publisher ?? null,
          pageCount: c.pageCount ?? snap.book?.pageCount,
          readingUrl: c.readingUrl ?? snap.book?.readingUrl,
        }
      : null,
    media: wantsMedia
      ? {
          ...(snap.media ?? {}),
          durationSeconds: c.durationMinutes ? c.durationMinutes * 60 : snap.media?.durationSeconds,
          channel: c.channel ?? snap.media?.channel,
          lessonCount: c.lessonCount ?? snap.media?.lessonCount,
        }
      : null,
  };
  const out = await submitResource(db, ctx, next, {
    id,
    allowDuplicate: true,
    origin: "ai",
    explanation: "AI update",
  });
  return out.mode === "applied"
    ? { updated: true, href: `/library/${id}` }
    : { suggested: true, href: "/suggestions" };
}

/**
 * Personal learning records ("my library"): status, exact start/finish
 * date-times, 10-point rating, short review and progress. One row per
 * (user, resource). Every query is owner-scoped AND runs under RLS.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withUser, type AppContext, type Database, type Tx } from "@/db/client";
import { bookDetails, learningRecords, mediaDetails, resources } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { learningRecordInput, zodFieldErrors, type LearningStatus } from "@/lib/validation";

async function assertResourceExists(tx: Tx, id: string) {
  const [r] = await tx
    .select({ id: resources.id })
    .from(resources)
    .where(and(eq(resources.id, id), isNull(resources.deletedAt)));
  if (!r) throw new AppError("NOT_FOUND");
}

export async function upsertLearningRecord(database: Database, ctx: AppContext, raw: unknown) {
  const parsed = learningRecordInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_record", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  const d = parsed.data;
  return withUser(database, ctx, async (tx) => {
    await assertResourceExists(tx, d.resourceId);
    const now = new Date();
    const values = {
      userId: ctx.userId,
      resourceId: d.resourceId,
      status: d.status,
      // Status implies a timestamp when the user left it empty.
      startedAt: d.startedAt ?? (d.status !== "planned" ? now : null),
      completedAt: d.completedAt ?? (d.status === "completed" ? now : null),
      rating: d.rating,
      review: d.review,
      progressCurrent: d.progressCurrent,
      progressTotal: d.progressTotal,
      progressUnit: d.progressUnit,
      lastAccessedAt: now,
    };
    if (values.startedAt && values.completedAt && values.startedAt > values.completedAt)
      values.startedAt = values.completedAt;
    const [row] = await tx
      .insert(learningRecords)
      .values(values)
      .onConflictDoUpdate({
        target: [learningRecords.userId, learningRecords.resourceId],
        set: { ...values, userId: undefined, resourceId: undefined },
      })
      .returning({ id: learningRecords.id });
    return row.id;
  });
}

/** Quick status change (shelf buttons, AI). Fills missing timestamps with "now". */
export async function setLearningStatus(
  database: Database,
  ctx: AppContext,
  resourceId: string,
  status: LearningStatus,
) {
  return withUser(database, ctx, async (tx) => {
    await assertResourceExists(tx, resourceId);
    const now = new Date();
    await tx
      .insert(learningRecords)
      .values({
        userId: ctx.userId,
        resourceId,
        status,
        lastAccessedAt: now,
        startedAt: status === "planned" ? null : now,
        completedAt: status === "completed" ? now : null,
      })
      .onConflictDoUpdate({
        target: [learningRecords.userId, learningRecords.resourceId],
        set: {
          status,
          lastAccessedAt: now,
          startedAt:
            status === "planned"
              ? sql`${learningRecords.startedAt}`
              : sql`coalesce(${learningRecords.startedAt}, now())`,
          completedAt:
            status === "completed"
              ? sql`coalesce(${learningRecords.completedAt}, now())`
              : sql`${learningRecords.completedAt}`,
        },
      });
  });
}

export async function removeLearningRecord(
  database: Database,
  ctx: AppContext,
  resourceId: string,
) {
  return withUser(database, ctx, (tx) =>
    tx
      .delete(learningRecords)
      .where(
        and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, resourceId)),
      ),
  );
}

export async function listMyRecords(database: Database, ctx: AppContext, status?: string | null) {
  return withUser(database, ctx, (tx) =>
    tx
      .select({
        id: learningRecords.id,
        resourceId: learningRecords.resourceId,
        status: learningRecords.status,
        startedAt: learningRecords.startedAt,
        completedAt: learningRecords.completedAt,
        rating: learningRecords.rating,
        progressCurrent: learningRecords.progressCurrent,
        progressTotal: learningRecords.progressTotal,
        progressUnit: learningRecords.progressUnit,
        lastAccessedAt: learningRecords.lastAccessedAt,
        title: resources.title,
        type: resources.type,
        coverUrl: resources.coverUrl,
        coverFileId: resources.coverFileId,
        description: resources.description,
        originalDate: resources.originalDate,
        publicationDate: resources.publicationDate,
        pageCount: bookDetails.pageCount,
        durationSeconds: mediaDetails.durationSeconds,
        lessonCount: mediaDetails.lessonCount,
        authors: sql<string | null>`(select string_agg(p.full_name, ', ' order by c.position)
          from nodinest.resource_contributors c join nodinest.people p on p.id = c.person_id
          where c.resource_id = "resources"."id")`,
      })
      .from(learningRecords)
      .innerJoin(resources, eq(resources.id, learningRecords.resourceId))
      .leftJoin(bookDetails, eq(bookDetails.resourceId, resources.id))
      .leftJoin(mediaDetails, eq(mediaDetails.resourceId, resources.id))
      .where(
        and(
          eq(learningRecords.userId, ctx.userId),
          isNull(resources.deletedAt),
          status ? eq(learningRecords.status, status as never) : undefined,
        ),
      )
      .orderBy(
        sql`coalesce(${learningRecords.completedAt}, ${learningRecords.lastAccessedAt}, ${learningRecords.updatedAt}) desc`,
        desc(learningRecords.updatedAt),
      )
      .limit(500),
  );
}

/**
 * Sets only the rating (1–10). A missing record is created as "completed"
 * (you rate what you finished); an existing one keeps all its other fields.
 */
export async function setRating(
  database: Database,
  ctx: AppContext,
  resourceId: string,
  rating: number,
) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 10)
    throw new AppError("VALIDATION", "rating");
  await withUser(database, ctx, async (tx) => {
    await assertResourceExists(tx, resourceId);
    const now = new Date();
    await tx
      .insert(learningRecords)
      .values({
        userId: ctx.userId,
        resourceId,
        status: "completed",
        rating,
        startedAt: now,
        completedAt: now,
        lastAccessedAt: now,
      })
      .onConflictDoUpdate({
        target: [learningRecords.userId, learningRecords.resourceId],
        set: { rating, updatedAt: now },
      });
  });
}

/**
 * Konspekt: a user's chapter-by-chapter summary of a resource (private).
 * Sections are ordered by `position`; the UI shows them as a table of
 * contents on the left and the selected chapter on the right.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { withUser, type AppContext, type Database } from "@/db/client";
import { conspectSections, resources } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { conspectSectionInput, zodFieldErrors } from "@/lib/validation";

export async function listSections(database: Database, ctx: AppContext, resourceId: string) {
  return withUser(database, ctx, (tx) =>
    tx
      .select()
      .from(conspectSections)
      .where(
        and(eq(conspectSections.userId, ctx.userId), eq(conspectSections.resourceId, resourceId)),
      )
      .orderBy(asc(conspectSections.position), asc(conspectSections.createdAt)),
  );
}

export async function createSection(
  database: Database,
  ctx: AppContext,
  resourceId: string,
  raw: unknown,
  opts: { afterId?: string | null } = {},
) {
  const parsed = conspectSectionInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_section", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  return withUser(database, ctx, async (tx) => {
    const [r] = await tx
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.id, resourceId));
    if (!r) throw new AppError("NOT_FOUND");
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${conspectSections.position}), 0)` })
      .from(conspectSections)
      .where(
        and(eq(conspectSections.userId, ctx.userId), eq(conspectSections.resourceId, resourceId)),
      );
    let position = Number(max) + 1;
    if (opts.afterId) {
      const [after] = await tx
        .select({ position: conspectSections.position })
        .from(conspectSections)
        .where(and(eq(conspectSections.id, opts.afterId), eq(conspectSections.userId, ctx.userId)));
      if (after) {
        position = after.position + 1;
        await tx
          .update(conspectSections)
          .set({ position: sql`${conspectSections.position} + 1` })
          .where(
            and(
              eq(conspectSections.userId, ctx.userId),
              eq(conspectSections.resourceId, resourceId),
              sql`${conspectSections.position} >= ${position}`,
            ),
          );
      }
    }
    const [row] = await tx
      .insert(conspectSections)
      .values({ ...parsed.data, userId: ctx.userId, resourceId, position })
      .returning({ id: conspectSections.id });
    return row.id;
  });
}

export async function updateSection(database: Database, ctx: AppContext, id: string, raw: unknown) {
  const parsed = conspectSectionInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_section", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .update(conspectSections)
      .set(parsed.data)
      .where(and(eq(conspectSections.id, id), eq(conspectSections.userId, ctx.userId)))
      .returning({ id: conspectSections.id });
    if (!res.length) throw new AppError("NOT_FOUND");
  });
}

export async function deleteSection(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .delete(conspectSections)
      .where(and(eq(conspectSections.id, id), eq(conspectSections.userId, ctx.userId)))
      .returning({ id: conspectSections.id });
    if (!res.length) throw new AppError("NOT_FOUND");
  });
}

/** Persists a new order (ids must all belong to the user and the resource). */
export async function reorderSections(
  database: Database,
  ctx: AppContext,
  resourceId: string,
  ids: string[],
) {
  return withUser(database, ctx, async (tx) => {
    const existing = await tx
      .select({ id: conspectSections.id })
      .from(conspectSections)
      .where(
        and(eq(conspectSections.userId, ctx.userId), eq(conspectSections.resourceId, resourceId)),
      );
    const set = new Set(existing.map((e) => e.id));
    if (ids.length !== set.size || ids.some((i) => !set.has(i)))
      throw new AppError("VALIDATION", "order_mismatch");
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(conspectSections)
        .set({ position: i + 1 })
        .where(and(eq(conspectSections.id, ids[i]), eq(conspectSections.userId, ctx.userId)));
    }
  });
}

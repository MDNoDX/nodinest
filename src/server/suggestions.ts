/**
 * Catalog write entry points + the suggestion / moderation workflow.
 *
 *  superadmin → changes are applied directly (transaction + audit log)
 *  regular user → a pending suggestion is created; nothing in the shared
 *                 catalog changes until a superadmin approves it.
 *
 * Approval re-validates the payload, re-checks duplicates, verifies the
 * reviewer's role and applies everything in a single transaction.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { withUser, type AppContext, type Database } from "@/db/client";
import { people, resources, suggestions, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { suggestionInput, zodFieldErrors } from "@/lib/validation";
import { audit } from "./audit";
import {
  applyArchive,
  applyCreatePerson,
  applyCreateResource,
  applyUpdatePerson,
  applyUpdateResource,
  findDuplicatePeople,
  findDuplicateResources,
  getPersonSnapshot,
  getResourceSnapshot,
  parsePerson,
  parseResource,
} from "./catalog";

export type WriteOutcome =
  { mode: "applied"; id: string } | { mode: "suggested"; suggestionId: string };

type SubmitOpts = {
  id?: string | null;
  explanation?: string | null;
  sourceUrls?: string[];
  allowDuplicate?: boolean;
  origin?: "manual" | "ai";
};

export async function submitPerson(
  database: Database,
  ctx: AppContext,
  raw: unknown,
  opts: SubmitOpts = {},
): Promise<WriteOutcome> {
  const data = parsePerson(raw);
  return withUser(database, ctx, async (tx) => {
    if (opts.id) {
      const [exists] = await tx
        .select({ id: people.id })
        .from(people)
        .where(eq(people.id, opts.id));
      if (!exists) throw new AppError("NOT_FOUND");
    }
    if (!opts.allowDuplicate) {
      const dups = await findDuplicatePeople(tx, data, opts.id ?? undefined);
      if (dups.length > 0)
        throw new AppError("DUPLICATE", "possible_duplicate", { candidates: dups });
    }
    if (ctx.role === "superadmin") {
      const meta = { origin: opts.origin ?? "manual" };
      if (opts.id) {
        await applyUpdatePerson(tx, ctx, opts.id, data, meta);
        return { mode: "applied", id: opts.id } as const;
      }
      return { mode: "applied", id: await applyCreatePerson(tx, ctx, data, meta) } as const;
    }
    const baseSnapshot = opts.id ? await getPersonSnapshot(tx, opts.id) : null;
    const [s] = await tx
      .insert(suggestions)
      .values({
        userId: ctx.userId,
        operation: opts.id ? "update" : "create",
        targetType: "person",
        targetId: opts.id ?? null,
        payload: data,
        baseSnapshot,
        explanation: opts.explanation ?? null,
        sourceUrls: opts.sourceUrls ?? [],
        origin: opts.origin ?? "manual",
      })
      .returning({ id: suggestions.id });
    return { mode: "suggested", suggestionId: s.id } as const;
  });
}

export async function submitResource(
  database: Database,
  ctx: AppContext,
  raw: unknown,
  opts: SubmitOpts = {},
): Promise<WriteOutcome> {
  const data = parseResource(raw);
  return withUser(database, ctx, async (tx) => {
    if (opts.id) {
      const [exists] = await tx
        .select({ id: resources.id })
        .from(resources)
        .where(eq(resources.id, opts.id));
      if (!exists) throw new AppError("NOT_FOUND");
    }
    if (!opts.allowDuplicate) {
      const dups = await findDuplicateResources(tx, data, opts.id ?? undefined);
      if (dups.length > 0)
        throw new AppError("DUPLICATE", "possible_duplicate", { candidates: dups });
    }
    if (ctx.role === "superadmin") {
      const meta = { origin: opts.origin ?? "manual" };
      if (opts.id) {
        await applyUpdateResource(tx, ctx, opts.id, data, meta);
        return { mode: "applied", id: opts.id } as const;
      }
      return { mode: "applied", id: await applyCreateResource(tx, ctx, data, meta) } as const;
    }
    const baseSnapshot = opts.id ? await getResourceSnapshot(tx, opts.id) : null;
    const [s] = await tx
      .insert(suggestions)
      .values({
        userId: ctx.userId,
        operation: opts.id ? "update" : "create",
        targetType: "resource",
        targetId: opts.id ?? null,
        payload: data,
        baseSnapshot,
        explanation: opts.explanation ?? null,
        sourceUrls: opts.sourceUrls ?? [],
        origin: opts.origin ?? "manual",
      })
      .returning({ id: suggestions.id });
    return { mode: "suggested", suggestionId: s.id } as const;
  });
}

export async function submitArchive(
  database: Database,
  ctx: AppContext,
  type: "person" | "resource",
  id: string,
  archived: boolean,
  explanation?: string | null,
): Promise<WriteOutcome> {
  return withUser(database, ctx, async (tx) => {
    if (ctx.role === "superadmin") {
      await applyArchive(tx, ctx, type, id, archived);
      return { mode: "applied", id } as const;
    }
    if (!archived) throw new AppError("FORBIDDEN");
    const [s] = await tx
      .insert(suggestions)
      .values({
        userId: ctx.userId,
        operation: "archive",
        targetType: type,
        targetId: id,
        payload: {},
        explanation: explanation ?? null,
      })
      .returning({ id: suggestions.id });
    return { mode: "suggested", suggestionId: s.id } as const;
  });
}

/** Generic suggestion submission (used by the AI "propose edit" tool). */
export async function submitSuggestion(
  database: Database,
  ctx: AppContext,
  raw: unknown,
  origin: "manual" | "ai" = "manual",
) {
  const parsed = suggestionInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_suggestion", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  const s = parsed.data;
  if (s.operation !== "create" && !s.targetId) throw new AppError("VALIDATION", "target_required");
  const opts = {
    id: s.operation === "update" ? s.targetId : null,
    explanation: s.explanation,
    sourceUrls: s.sourceUrls,
    origin,
    allowDuplicate: true,
  };
  // Regular users always produce suggestions; this path never applies
  // directly, even for superadmins, so AI proposals stay reviewable.
  const asUser: AppContext = { ...ctx, role: "user" };
  if (s.operation === "archive")
    return submitArchive(database, asUser, s.targetType, s.targetId!, true, s.explanation);
  return s.targetType === "person"
    ? submitPerson(database, asUser, s.payload, opts)
    : submitResource(database, asUser, s.payload, opts);
}

export async function withdrawSuggestion(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .update(suggestions)
      .set({ status: "withdrawn" })
      .where(
        and(
          eq(suggestions.id, id),
          eq(suggestions.userId, ctx.userId),
          eq(suggestions.status, "pending"),
        ),
      )
      .returning({ id: suggestions.id });
    if (res.length === 0) throw new AppError("NOT_FOUND");
  });
}

export async function reviewSuggestion(
  database: Database,
  ctx: AppContext,
  id: string,
  decision: "approve" | "reject",
  reviewNote?: string | null,
  opts: { allowDuplicate?: boolean } = {},
) {
  if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
  return withUser(database, ctx, async (tx) => {
    const locked = await tx.execute<{ id: string }>(
      sql`select id from nodinest.suggestions where id = ${id} for update`,
    );
    if (locked.length === 0) throw new AppError("NOT_FOUND");
    const [s] = await tx.select().from(suggestions).where(eq(suggestions.id, id));
    if (s.status !== "pending") throw new AppError("CONFLICT", "not_pending");

    let appliedTargetId: string | null = null;
    if (decision === "approve") {
      const meta = { suggestionId: s.id, suggestedBy: s.userId };
      if (s.operation === "archive") {
        await applyArchive(tx, ctx, s.targetType, s.targetId!, true, meta);
        appliedTargetId = s.targetId;
      } else if (s.targetType === "person") {
        const data = parsePerson(s.payload);
        if (!opts.allowDuplicate) {
          const dups = await findDuplicatePeople(tx, data, s.targetId ?? undefined);
          if (dups.length)
            throw new AppError("DUPLICATE", "possible_duplicate", { candidates: dups });
        }
        if (s.operation === "create")
          appliedTargetId = await applyCreatePerson(tx, ctx, data, meta);
        else {
          await applyUpdatePerson(tx, ctx, s.targetId!, data, meta);
          appliedTargetId = s.targetId;
        }
      } else {
        const data = parseResource(s.payload);
        if (!opts.allowDuplicate) {
          const dups = await findDuplicateResources(tx, data, s.targetId ?? undefined);
          if (dups.length)
            throw new AppError("DUPLICATE", "possible_duplicate", { candidates: dups });
        }
        if (s.operation === "create")
          appliedTargetId = await applyCreateResource(tx, ctx, data, meta);
        else {
          await applyUpdateResource(tx, ctx, s.targetId!, data, meta);
          appliedTargetId = s.targetId;
        }
      }
    }
    await tx
      .update(suggestions)
      .set({
        status: decision === "approve" ? "approved" : "rejected",
        reviewNote: reviewNote ?? null,
        reviewerId: ctx.userId,
        reviewedAt: new Date(),
        appliedTargetId,
      })
      .where(eq(suggestions.id, id));
    await audit(tx, {
      actorId: ctx.userId,
      action: `suggestion.${decision}`,
      entityType: "suggestion",
      entityId: id,
      meta: { appliedTargetId, targetType: s.targetType, operation: s.operation },
    });
    return { appliedTargetId };
  });
}

export async function listSuggestions(
  database: Database,
  ctx: AppContext,
  f: { scope: "mine" | "all"; status?: string | null },
) {
  return withUser(database, ctx, async (tx) => {
    const conds = [];
    if (f.scope === "mine" || ctx.role !== "superadmin")
      conds.push(eq(suggestions.userId, ctx.userId));
    if (f.status) conds.push(eq(suggestions.status, f.status as never));
    return tx
      .select({
        id: suggestions.id,
        operation: suggestions.operation,
        targetType: suggestions.targetType,
        targetId: suggestions.targetId,
        status: suggestions.status,
        explanation: suggestions.explanation,
        createdAt: suggestions.createdAt,
        reviewedAt: suggestions.reviewedAt,
        reviewNote: suggestions.reviewNote,
        origin: suggestions.origin,
        payload: suggestions.payload,
        userId: suggestions.userId,
      })
      .from(suggestions)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(suggestions.createdAt))
      .limit(100);
  });
}

export async function getSuggestionForReview(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const [s] = await tx.select().from(suggestions).where(eq(suggestions.id, id));
    if (!s) return null;
    if (s.userId !== ctx.userId && ctx.role !== "superadmin") return null;
    const current =
      s.targetId == null
        ? null
        : s.targetType === "person"
          ? await getPersonSnapshot(tx, s.targetId)
          : await getResourceSnapshot(tx, s.targetId);
    const [author] = await database
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, s.userId));
    return { suggestion: s, current, author: author ?? null };
  });
}

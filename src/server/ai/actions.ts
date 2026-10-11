/**
 * Confirmation step for AI-proposed operations. Arguments are re-validated,
 * the user's CURRENT permissions are re-checked, and the status only becomes
 * "completed" after the database operation actually succeeded.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { aiActions, learningRecords } from "@/db/schema";
import { AppError, toActionError } from "@/lib/errors";
import { savePlan } from "../goals";
import { upsertLearningRecord } from "../journal";
import { saveNote } from "../notes";
import { getAiSettings } from "../settings";
import { getPersonSnapshot, getResourceSnapshot } from "../catalog";
import { submitPerson, submitResource, submitSuggestion } from "../suggestions";
import { TOOL_PERMISSION, isToolName, toolArgSchemas, WRITE_TOOLS } from "./tools";

export type ActionOutcome =
  { status: "completed"; result: unknown } | { status: "failed"; code: string; details?: unknown };

async function execute(
  ctx: AppContext,
  tool: string,
  rawArgs: unknown,
  opts: { allowDuplicate?: boolean },
) {
  if (!isToolName(tool) || !WRITE_TOOLS.includes(tool)) throw new AppError("FORBIDDEN");
  switch (tool) {
    case "create_note": {
      const a = toolArgSchemas.create_note.parse(rawArgs);
      const id = await saveNote(db, ctx, { ...a, visibility: "private" });
      return { noteId: id, href: `/notes/${id}` };
    }
    case "update_learning_record": {
      const a = toolArgSchemas.update_learning_record.parse(rawArgs);
      const [rec] = await withUser(db, ctx, (tx) =>
        tx
          .select()
          .from(learningRecords)
          .where(
            and(
              eq(learningRecords.userId, ctx.userId),
              eq(learningRecords.resourceId, a.resourceId),
            ),
          ),
      );
      await upsertLearningRecord(db, ctx, {
        resourceId: a.resourceId,
        status: a.status ?? rec?.status ?? "planned",
        startedOn: rec?.startedOn ?? null,
        completedOn: rec?.completedOn ?? null,
        rating: a.rating ?? rec?.rating ?? null,
        review: a.review ?? rec?.review ?? null,
        learningGoals: rec?.learningGoals ?? null,
        personalNotes: rec?.personalNotes ?? null,
        progressCurrent: a.progressCurrent ?? rec?.progressCurrent ?? null,
        progressTotal: a.progressTotal ?? rec?.progressTotal ?? null,
        progressUnit: rec?.progressUnit ?? "pages",
      });
      return { resourceId: a.resourceId, href: `/library/${a.resourceId}` };
    }
    case "create_plan": {
      const a = toolArgSchemas.create_plan.parse(rawArgs);
      const id = await savePlan(db, ctx, a);
      return { planId: id, href: "/plans" };
    }
    case "propose_person": {
      const a = toolArgSchemas.propose_person.parse(rawArgs);
      const out = await submitPerson(
        db,
        ctx,
        {
          fullName: a.fullName,
          aliases: a.aliases ?? [],
          shortDescription: a.shortDescription,
          biography: a.biography,
          birthDate: a.birthDate,
          deathDate: a.deathDate,
          nationality: a.nationality,
          roles: a.roles ?? [],
          portraitUrl: a.portraitUrl,
          websiteUrl: a.websiteUrl,
          links: a.sourceUrls.map((url) => ({ kind: "source", url })),
        },
        {
          sourceUrls: a.sourceUrls,
          origin: "ai",
          allowDuplicate: opts.allowDuplicate,
          explanation: "AI-assisted import",
        },
      );
      return out.mode === "applied"
        ? { ...out, href: `/people/${out.id}` }
        : { ...out, href: "/suggestions" };
    }
    case "propose_resource": {
      const a = toolArgSchemas.propose_resource.parse(rawArgs);
      const isBook = a.type === "book" || a.type === "course";
      const out = await submitResource(
        db,
        ctx,
        {
          type: a.type,
          title: a.title,
          originalTitle: a.originalTitle,
          description: a.description,
          language: a.language,
          publicationDate: a.publicationDate,
          sourceUrl: a.sourceUrl,
          coverUrl: a.coverUrl,
          contributors: (a.contributors ?? [])
            .filter((c) => c.personId || c.name)
            .map((c) => ({
              personId: c.personId ?? null,
              newPersonName: c.personId ? null : c.name,
              role: c.role,
            })),
          identifiers: [
            ...(a.isbn
              ? [
                  {
                    scheme: a.isbn.replace(/[\s-]/g, "").length === 10 ? "isbn10" : "isbn13",
                    value: a.isbn,
                  },
                ]
              : []),
            ...(a.youtubeId ? [{ scheme: "youtube", value: a.youtubeId }] : []),
          ],
          links: (a.sourceUrls ?? []).map((url) => ({ kind: "source", url })),
          book: isBook ? { publisher: a.publisher, pageCount: a.pageCount } : null,
          media: !isBook
            ? {
                channel: a.channel,
                durationSeconds: a.durationSeconds,
                platform: a.youtubeId ? "YouTube" : null,
              }
            : null,
        },
        {
          sourceUrls: a.sourceUrls ?? [],
          origin: "ai",
          allowDuplicate: opts.allowDuplicate,
          explanation: "AI-assisted import",
        },
      );
      return out.mode === "applied"
        ? { ...out, href: `/library/${out.id}` }
        : { ...out, href: "/suggestions" };
    }
    case "propose_catalog_edit": {
      const a = toolArgSchemas.propose_catalog_edit.parse(rawArgs);
      const current: Record<string, unknown> | null = await withUser(db, ctx, (tx) =>
        a.targetType === "person"
          ? (getPersonSnapshot(tx, a.targetId) as Promise<Record<string, unknown> | null>)
          : (getResourceSnapshot(tx, a.targetId) as Promise<Record<string, unknown> | null>),
      );
      if (!current) throw new AppError("NOT_FOUND");
      const allowed = Object.keys(current);
      const changes = Object.fromEntries(
        Object.entries(a.changes).filter(([k]) => allowed.includes(k)),
      );
      if (Object.keys(changes).length === 0) throw new AppError("VALIDATION", "no_valid_changes");
      const out = await submitSuggestion(
        db,
        ctx,
        {
          operation: "update",
          targetType: a.targetType,
          targetId: a.targetId,
          payload: { ...current, ...changes },
          explanation: a.explanation,
          sourceUrls: a.sourceUrls ?? [],
        },
        "ai",
      );
      return { ...out, href: "/suggestions" };
    }
  }
}

export async function confirmAiAction(
  ctx: AppContext,
  actionId: string,
  opts: { allowDuplicate?: boolean } = {},
): Promise<ActionOutcome> {
  const parsedId = z.string().uuid().safeParse(actionId);
  if (!parsedId.success) throw new AppError("NOT_FOUND");
  // Claim the action atomically so a double click cannot run it twice.
  const [action] = await withUser(db, ctx, (tx) =>
    tx
      .update(aiActions)
      .set({ decidedAt: new Date() })
      .where(
        and(
          eq(aiActions.id, actionId),
          eq(aiActions.userId, ctx.userId),
          eq(aiActions.status, "proposed"),
        ),
      )
      .returning(),
  );
  if (!action) throw new AppError("NOT_FOUND");
  const settings = await getAiSettings(db);
  const permission = isToolName(action.tool) ? TOOL_PERMISSION[action.tool] : null;
  try {
    if (!permission || !settings.allowedTools.includes(permission))
      throw new AppError("FORBIDDEN", "tool_disabled");
    const result = await execute(ctx, action.tool, action.args, opts);
    await withUser(db, ctx, (tx) =>
      tx
        .update(aiActions)
        .set({ status: "completed", result: { ...(action.result as object), outcome: result } })
        .where(eq(aiActions.id, actionId)),
    );
    return { status: "completed", result };
  } catch (err) {
    const e = toActionError(err);
    // Duplicates are recoverable: keep the proposal open so the user can
    // choose "create anyway" or cancel.
    if (e.code === "DUPLICATE") {
      await withUser(db, ctx, (tx) =>
        tx.update(aiActions).set({ decidedAt: null }).where(eq(aiActions.id, actionId)),
      );
      return { status: "failed", code: e.code, details: e.details };
    }
    await withUser(db, ctx, (tx) =>
      tx
        .update(aiActions)
        .set({ status: "failed", error: e.code })
        .where(eq(aiActions.id, actionId)),
    );
    return { status: "failed", code: e.code, details: e.fieldErrors };
  }
}

export async function rejectAiAction(ctx: AppContext, actionId: string) {
  const res = await withUser(db, ctx, (tx) =>
    tx
      .update(aiActions)
      .set({ status: "rejected", decidedAt: new Date() })
      .where(
        and(
          eq(aiActions.id, actionId),
          eq(aiActions.userId, ctx.userId),
          eq(aiActions.status, "proposed"),
        ),
      )
      .returning({ id: aiActions.id }),
  );
  if (!res.length) throw new AppError("NOT_FOUND");
}

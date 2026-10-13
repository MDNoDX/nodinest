/**
 * Confirmation step for destructive AI proposals (mode "confirm"). Arguments
 * are re-validated, the admin's permission allowlist is re-checked, and the
 * status becomes "completed" only after the operation actually succeeded.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { aiActions } from "@/db/schema";
import { AppError, toActionError } from "@/lib/errors";
import { getAiSettings } from "../settings";
import { isToolName, runTool, toolDef } from "./tools";

export type ActionOutcome =
  { status: "completed"; result: unknown } | { status: "failed"; code: string; details?: unknown };

export async function confirmAiAction(
  ctx: AppContext,
  actionId: string,
  env: { timeZone: string; locale: string },
): Promise<ActionOutcome> {
  if (!z.string().uuid().safeParse(actionId).success) throw new AppError("NOT_FOUND");
  // Claim atomically so a double click cannot run it twice.
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
  try {
    if (!isToolName(action.tool) || toolDef(action.tool).mode !== "confirm")
      throw new AppError("FORBIDDEN");
    if (!settings.allowedTools.includes(toolDef(action.tool).perm))
      throw new AppError("FORBIDDEN", "tool_disabled");
    const result = await runTool(action.tool, action.args, ctx, env);
    await withUser(db, ctx, (tx) =>
      tx
        .update(aiActions)
        .set({ status: "completed", result: { outcome: result } })
        .where(eq(aiActions.id, actionId)),
    );
    return { status: "completed", result };
  } catch (err) {
    const e = toActionError(err);
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

import "server-only";
import { db, type AppContext } from "@/db";
import { getCurrentUser, requireActor, toCtx } from "@/lib/auth/session";
import { GUEST } from "@/lib/page";
import type { CurrentUser } from "@/lib/auth/session";
import { toActionError, type ActionResult } from "@/lib/errors";

/**
 * Wraps a server action: authenticates the caller (role re-read from the DB),
 * runs the operation and converts errors into a typed, translatable result.
 */
export async function run<T>(
  fn: (a: { ctx: AppContext; user: CurrentUser; db: typeof db }) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const { ctx, user } = await requireActor();
    return { ok: true, data: await fn({ ctx, user, db }) };
  } catch (err) {
    return toActionError(err);
  }
}

/** A read a guest may make too (Media pages, comments): the user's context, or the guest's. */
export async function runOpen<T>(fn: (a: { ctx: AppContext }) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const u = await getCurrentUser();
    return { ok: true, data: await fn({ ctx: u ? toCtx(u) : GUEST }) };
  } catch (err) {
    return toActionError(err);
  }
}

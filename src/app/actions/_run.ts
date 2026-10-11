import "server-only";
import { db, type AppContext } from "@/db";
import { requireActor } from "@/lib/auth/session";
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

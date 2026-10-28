/**
 * Deleting one's own account: every row of the user goes (foreign keys cascade;
 * shared catalog entries they created stay, without the author), and so do
 * their files in Blob storage. The superadmin account cannot delete itself.
 */
import "server-only";
import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db, type AppContext } from "@/db";
import { files, user } from "@/db/schema";
import { AppError } from "@/lib/errors";

export async function deleteAccount(ctx: AppContext) {
  if (ctx.superadminAccount) throw new AppError("FORBIDDEN", "superadmin");
  // Authorised: the caller deletes only their own account (ctx comes from the session).
  const paths = (
    await db.select({ path: files.path }).from(files).where(eq(files.ownerId, ctx.userId))
  ).map((f) => f.path);
  await db.delete(user).where(eq(user.id, ctx.userId));
  for (let i = 0; i < paths.length; i += 100) {
    await del(paths.slice(i, i + 100)).catch(() => {
      /* the rows are gone; an orphan blob is unreachable */
    });
  }
}

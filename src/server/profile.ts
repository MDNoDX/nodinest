/**
 * Profiles: first / last name, a unique username (required, chosen on the
 * first sign-in at /welcome) and a picture. The display name is first + last.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { files, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { moderationIssue } from "@/lib/moderation";
import { USERNAME_RE, normalizeUsername, usernameBase } from "@/lib/username";

/** Names nobody may take (routes, roles, the brand). */
const RESERVED = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "support",
  "help",
  "api",
  "app",
  "www",
  "nodinest",
  "nodinote",
  "nodinest_bot",
  "login",
  "logout",
  "welcome",
  "settings",
  "guide",
  "library",
  "notes",
  "write",
  "review",
  "assistant",
  "search",
  "stats",
  "privacy",
  "terms",
  "moderator",
  "official",
  "telegram",
  "google",
  "null",
  "undefined",
]);

export async function usernameFree(name: string, selfId?: string) {
  const u = normalizeUsername(name);
  if (!USERNAME_RE.test(u) || RESERVED.has(u)) return false;
  // Authorised read: only whether the name is taken (no other data leaves).
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.username}) = ${u}`);
  return !row || row.id === selfId;
}

/** A free username close to the person's name (or email). */
export async function suggestUsername(first: string, last: string | null, email: string) {
  const local = email.endsWith(".invalid") ? "" : email.split("@")[0];
  const bases = [
    usernameBase(`${first}_${last ?? ""}`),
    usernameBase(first),
    usernameBase(local),
    "reader",
  ].filter((b) => b.length >= 3);
  for (const b of bases) if (await usernameFree(b)) return b;
  const b = bases[0] ?? "reader";
  for (let i = 0; i < 20; i++) {
    const c = `${b.slice(0, 25)}${Math.floor(100 + Math.random() * 9900)}`;
    if (await usernameFree(c)) return c;
  }
  return `${b.slice(0, 20)}${Date.now().toString(36).slice(-6)}`;
}

export const profileInput = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).nullish(),
  username: z.string().trim().max(40),
  /**
   * The picture: an uploaded one (/api/files/<id>), the current one unchanged
   * (e.g. the Google photo), or null to remove it.
   */
  image: z.string().trim().max(2000).nullish(),
});

export async function saveProfile(ctx: AppContext, raw: unknown) {
  const a = profileInput.parse(raw);
  const username = normalizeUsername(a.username);
  if ([a.firstName, a.lastName, username].some((v) => moderationIssue(v)))
    throw new AppError("INDECENT");
  if (!USERNAME_RE.test(username) || RESERVED.has(username))
    throw new AppError("VALIDATION", "username_invalid");
  if (!(await usernameFree(username, ctx.userId))) throw new AppError("CONFLICT", "username_taken");
  const [me] = await db.select({ image: user.image }).from(user).where(eq(user.id, ctx.userId));
  const keep = a.image === undefined || a.image === me?.image;
  if (a.image && !keep) {
    if (!/^\/api\/files\/[0-9a-f-]{36}$/.test(a.image)) throw new AppError("VALIDATION", "image");
    const [f] = await db
      .select({ owner: files.ownerId, purpose: files.purpose })
      .from(files)
      .where(eq(files.id, a.image.slice("/api/files/".length)));
    if (!f || f.owner !== ctx.userId || f.purpose !== "portrait")
      throw new AppError("FORBIDDEN", "image");
  }
  const first = a.firstName;
  const last = a.lastName?.trim() || null;
  await withUser(db, ctx, (tx) =>
    tx
      .update(user)
      .set({
        firstName: first,
        lastName: last,
        name: [first, last].filter(Boolean).join(" "),
        username,
        ...(keep ? {} : { image: a.image ?? null }),
        updatedAt: new Date(),
      })
      .where(eq(user.id, ctx.userId)),
  );
  return username;
}

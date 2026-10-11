/**
 * Server-side role bootstrap and first-login seeding. Pure DB logic (no Next
 * imports) so it is covered by integration tests.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { account, auditLogs, collections, user } from "@/db/schema";

export const DEFAULT_COLLECTIONS = [
  "to_read",
  "research_topics",
  "favorite_quotes",
  "learning_projects",
] as const;

export function parseSuperadminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+$/.test(e));
}

/**
 * Promotes a user to superadmin iff ALL of the following hold:
 *  - their email is in SUPERADMIN_EMAILS,
 *  - the email is verified (set from Google's `email_verified` claim),
 *  - they have a linked Google account (provider_id = 'google').
 * Dev email/password users can never satisfy this. Idempotent.
 */
export async function bootstrapSuperadmin(
  database: Database,
  userId: string,
  rawEmails: string | undefined,
): Promise<boolean> {
  const allowed = parseSuperadminEmails(rawEmails);
  if (allowed.length === 0) return false;
  const [u] = await database
    .select({ email: user.email, role: user.role, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId));
  if (!u || u.role === "superadmin" || !u.emailVerified) return false;
  if (!allowed.includes(u.email.toLowerCase())) return false;
  const [google] = await database
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google")));
  if (!google) return false;

  await database.transaction(async (tx) => {
    await tx.update(user).set({ role: "superadmin" }).where(eq(user.id, userId));
    await tx.insert(auditLogs).values({
      actorId: userId,
      action: "role.bootstrap_superadmin",
      entityType: "user",
      entityId: userId,
      after: { role: "superadmin" },
      meta: { reason: "verified google email in SUPERADMIN_EMAILS" },
    });
  });
  return true;
}

export async function isUserSuspended(database: Database, userId: string): Promise<boolean> {
  const [u] = await database.select({ status: user.status }).from(user).where(eq(user.id, userId));
  return u?.status === "suspended";
}

export async function seedNewUser(database: Database, userId: string): Promise<void> {
  await database
    .insert(collections)
    .values(DEFAULT_COLLECTIONS.map((key, i) => ({ userId, systemKey: key, sortOrder: i })))
    .onConflictDoNothing();
}

import { randomUUID } from "node:crypto";
import { createDb, type AppContext, type Database } from "@/db/client";
import { account, user } from "@/db/schema";
import { seedNewUser } from "@/lib/auth/bootstrap";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://mdnodx@127.0.0.1:5432/nodinest_test";

export function testDb(): Database {
  process.env.DB_RLS_ROLE ??= "nodinest_app";
  return createDb(TEST_DB_URL, { max: 4 });
}

export async function makeUser(
  db: Database,
  opts: {
    role?: "user" | "superadmin";
    email?: string;
    emailVerified?: boolean;
    google?: boolean;
  } = {},
): Promise<AppContext & { email: string }> {
  const email = opts.email ?? `u-${randomUUID().slice(0, 8)}@example.test`;
  const [u] = await db
    .insert(user)
    .values({
      name: email.split("@")[0],
      email,
      emailVerified: opts.emailVerified ?? true,
      role: opts.role ?? "user",
    })
    .returning({ id: user.id });
  await seedNewUser(db, u.id);
  if (opts.google) {
    await db
      .insert(account)
      .values({ userId: u.id, providerId: "google", accountId: randomUUID() });
  }
  return { userId: u.id, role: opts.role ?? "user", email };
}

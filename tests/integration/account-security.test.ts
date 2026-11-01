import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { session } from "@/db/schema";
import { passwordOk } from "@/lib/password";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

const addSession = async (userId: string, n: number) => {
  const [s] = await db
    .insert(session)
    .values({
      userId,
      token: `t-${userId}-${n}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      updatedAt: new Date(Date.now() + n * 1000),
    })
    .returning({ id: session.id });
  return s.id;
};

describe("account security", () => {
  it("password rules", () => {
    expect(passwordOk("Abcdefg1")).toBe(true);
    for (const p of ["short1A", "abcdefg1", "ABCDEFG1", "Abcdefgh", `A1${"a".repeat(130)}`])
      expect(passwordOk(p), p).toBe(false);
  });

  it("keeps two devices: a new sign-in pushes out the oldest; superadmin is not limited", async () => {
    const { enforceDeviceLimit, removeDevice } = await import("@/server/account-security");
    const u = await makeUser(db);
    const a = await addSession(u.userId, 1);
    const b = await addSession(u.userId, 2);
    const c = await addSession(u.userId, 3);
    await enforceDeviceLimit(u.userId, c);
    const left = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, u.userId));
    expect(left.map((x) => x.id).sort()).toEqual([b, c].sort());
    expect(left.map((x) => x.id)).not.toContain(a);

    // Removing someone else's device does nothing.
    const other = await makeUser(db);
    await removeDevice(other, b);
    const still = await db
      .select({ id: session.id })
      .from(session)
      .where(and(eq(session.userId, u.userId), eq(session.id, b)));
    expect(still).toHaveLength(1);

    const boss = await makeUser(db, { role: "superadmin" });
    const ids = [await addSession(boss.userId, 1), await addSession(boss.userId, 2)];
    const last = await addSession(boss.userId, 3);
    await enforceDeviceLimit(boss.userId, last);
    const kept = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, boss.userId));
    expect(kept).toHaveLength(ids.length + 1);
  });
});

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import { bootstrapSuperadmin, parseSuperadminEmails } from "@/lib/auth/bootstrap";
import { setAdminPerms, setUserRole, setUserStatus } from "@/server/admin";
import { listPayments } from "@/server/premium";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

async function roleOf(id: string) {
  const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, id));
  return u.role;
}

describe("superadmin bootstrap", () => {
  it("parses the allow-list safely", () => {
    expect(parseSuperadminEmails(" MDNODX@gmail.com, bad, ,x@y.z")).toEqual([
      "mdnodx@gmail.com",
      "x@y.z",
    ]);
    expect(parseSuperadminEmails(undefined)).toEqual([]);
  });

  it("promotes only a verified Google account with an allow-listed email", async () => {
    const ok = await makeUser(db, {
      email: "boss1@example.test",
      google: true,
      emailVerified: true,
    });
    expect(await bootstrapSuperadmin(db, ok.userId, "boss1@example.test")).toBe(true);
    expect(await roleOf(ok.userId)).toBe("superadmin");
    const audit = await db.execute<{ action: string }>(
      sql`select action from nodinest.audit_logs where entity_id = ${ok.userId}`,
    );
    expect(audit[0].action).toBe("role.bootstrap_superadmin");
  });

  it("does not promote without a Google account (e.g. dev email/password)", async () => {
    const u = await makeUser(db, {
      email: "boss2@example.test",
      google: false,
      emailVerified: true,
    });
    expect(await bootstrapSuperadmin(db, u.userId, "boss2@example.test")).toBe(false);
    expect(await roleOf(u.userId)).toBe("user");
  });

  it("does not promote unverified emails or non-listed emails", async () => {
    const a = await makeUser(db, {
      email: "boss3@example.test",
      google: true,
      emailVerified: false,
    });
    expect(await bootstrapSuperadmin(db, a.userId, "boss3@example.test")).toBe(false);
    const b = await makeUser(db, { email: "random@example.test", google: true });
    expect(await bootstrapSuperadmin(db, b.userId, "boss3@example.test")).toBe(false);
    expect(await roleOf(b.userId)).toBe("user");
  });

  it("role management requires superadmin and protects the last superadmin", async () => {
    const admin = await makeUser(db, { role: "superadmin" });
    const u = await makeUser(db);
    await expect(setUserRole(db, u, u.userId, "superadmin")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await setUserRole(db, admin, u.userId, "superadmin");
    expect(await roleOf(u.userId)).toBe("superadmin");
    await setUserRole(db, admin, u.userId, "user");
    await expect(setUserStatus(db, admin, admin.userId, "suspended")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("admins get only the parts the superadmin gave them; the superadmin is untouchable", async () => {
    const boss = await makeUser(db, { role: "superadmin" });
    const helper = await makeUser(db);
    const other = await makeUser(db);
    await expect(setAdminPerms(db, helper, other.userId, ["users"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await setAdminPerms(db, boss, helper.userId, ["users", "payments", "nonsense"]);
    const [row] = await db.execute<{ p: string[] }>(
      sql`select admin_perms as p from nodinest."user" where id = ${helper.userId}`,
    );
    expect([...row.p].sort()).toEqual(["payments", "users"]);
    const asAdmin = { ...helper, perms: ["users", "payments"] };
    await expect(listPayments(asAdmin)).resolves.toBeDefined();
    await expect(listPayments(other)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setUserStatus(db, asAdmin, other.userId, "suspended");
    await setUserStatus(db, asAdmin, other.userId, "active");
    await expect(setUserStatus(db, asAdmin, boss.userId, "suspended")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(setAdminPerms(db, boss, boss.userId, ["ads"])).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

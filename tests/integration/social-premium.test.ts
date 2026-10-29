import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { learningRecords, user } from "@/db/schema";
import { submitResource } from "@/server/suggestions";
import { makeUser, testDb } from "../helpers/db";

vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify({ ok: true, result: {} }))),
);
const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

async function withUsername(u: { userId: string }, name: string) {
  await db.update(user).set({ username: name }).where(eq(user.id, u.userId));
}

describe("profiles and public items", () => {
  it("shows only public items of public profiles", async () => {
    const { follow, profileByUsername, publicItems, setProfilePublic, setItemVisibility } =
      await import("@/server/social");
    const a = await makeUser(db);
    const b = await makeUser(db);
    const ua = `a${Date.now().toString(36)}`;
    await withUsername(a, ua);
    const r1 = await submitResource(db, a, { type: "book", title: "Public Book" });
    const r2 = await submitResource(db, a, { type: "book", title: "Secret Book" });
    if (r1.mode !== "applied" || r2.mode !== "applied") throw new Error("applied");
    await db
      .insert(learningRecords)
      .values([
        { userId: a.userId, resourceId: r1.id, status: "in_progress" },
        { userId: a.userId, resourceId: r2.id, status: "planned" },
      ])
      .onConflictDoNothing();
    await setItemVisibility(a, r1.id, true);

    // Private profile: nothing shows, and it cannot be followed.
    let p = await profileByUsername(b, ua);
    expect(p?.visible).toBe(false);
    expect(await publicItems(b, a.userId)).toHaveLength(0);
    await expect(follow(b, a.userId, true)).rejects.toThrow();

    await setProfilePublic(a, true, "hi");
    p = await profileByUsername(b, ua);
    expect(p?.visible).toBe(true);
    const items = await publicItems(b, a.userId);
    expect(items.map((i) => i.title)).toEqual(["Public Book"]);
    await follow(b, a.userId, true);
    expect((await profileByUsername(b, ua))?.isFollowing).toBe(true);

    // Making the profile private hides everything again.
    await setProfilePublic(a, false, null);
    expect(await publicItems(b, a.userId)).toHaveLength(0);
  });
});

describe("premium", () => {
  it("lists followers / following and lets the owner remove a follower", async () => {
    const { follow, followList, removeFollower, setProfilePublic } =
      await import("@/server/social");
    const owner = await makeUser(db);
    const fan = await makeUser(db);
    const stranger = await makeUser(db);
    await withUsername(owner, `o${Date.now().toString(36)}`);
    await withUsername(fan, `f${Date.now().toString(36)}`);
    await setProfilePublic(owner, true, null);
    await setProfilePublic(fan, true, "Salom");
    await follow(fan, owner.userId, true);
    expect((await followList(owner, owner.userId, "followers")).map((r) => r.id)).toEqual([
      fan.userId,
    ]);
    expect((await followList(stranger, fan.userId, "following")).map((r) => r.id)).toEqual([
      owner.userId,
    ]);
    // A private profile's lists are hidden from others.
    await setProfilePublic(owner, false, null);
    expect(await followList(stranger, owner.userId, "followers")).toEqual([]);
    await removeFollower(owner, fan.userId);
    expect(await followList(owner, owner.userId, "followers")).toEqual([]);
    // Obscene bios are refused.
    await expect(setProfilePublic(fan, true, "f.u.c.k")).rejects.toMatchObject({
      code: "INDECENT",
    });
  });

  it("free limits until a payment is confirmed, then premium", async () => {
    const { decidePayment, limitsFor, requestPayment, requireFeature } =
      await import("@/server/premium");
    const u = await makeUser(db);
    const free = await limitsFor(u);
    expect(free.premium).toBe(false);
    expect(free.audiobook).toBe(false);
    await expect(requireFeature(u, "audiobook")).rejects.toThrow();
    const id = await requestPayment(u, { amount: 25000, months: 1, method: "card", note: "1234" });
    expect(await decidePayment(id, true, "test")).not.toBeNull();
    // A decided payment cannot be decided again.
    expect(await decidePayment(id, false, "test")).toBeNull();
    const pro = await limitsFor(u);
    expect(pro.premium).toBe(true);
    expect(pro.audiobook).toBe(true);
    expect(pro.aiDaily).toBeGreaterThan(free.aiDaily);
  });
});

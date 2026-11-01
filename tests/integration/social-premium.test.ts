import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { botUsers, learningRecords, user } from "@/db/schema";
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
  it("shows only public items, and a private profile only to accepted followers", async () => {
    const social = await import("@/server/social");
    const { listNotifications } = await import("@/server/notifications");
    const a = await makeUser(db);
    const b = await makeUser(db);
    const c = await makeUser(db);
    const ua = `a${Date.now().toString(36)}`;
    await withUsername(a, ua);
    await withUsername(b, `b${ua}`);
    await withUsername(c, `c${ua}`);
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
    await social.setItemVisibility(a, r1.id, true);

    // New accounts are public, and only the item marked public shows.
    expect((await social.profileByUsername(b, ua))?.visible).toBe(true);
    let items = await social.publicItems(b, a.userId);
    expect(items.map((i) => i.title)).toEqual(["Public Book"]);

    // Private: found by name, nothing inside, following becomes a request.
    await social.setProfilePublic(a, false, null);
    expect((await social.profileByUsername(b, ua))?.visible).toBe(false);
    expect(await social.publicItems(b, a.userId)).toHaveLength(0);
    const found = await social.searchPeople(b, ua);
    expect(found[0]).toMatchObject({ id: a.userId, locked: true, items: 0 });
    await expect(social.takeSource(b, r1.id, a.userId)).rejects.toThrow();
    expect(await social.follow(b, a.userId, true)).toBe("requested");
    expect((await social.profileByUsername(b, ua))?.requested).toBe(true);
    expect(await social.publicItems(b, a.userId)).toHaveLength(0);
    expect((await social.followRequestsForMe(a)).map((r) => r.id)).toEqual([b.userId]);
    expect((await listNotifications(a)).map((n) => n.kind)).toEqual(["follow_request"]);
    expect(await listNotifications(c)).toHaveLength(0);

    // A stranger cannot answer a request meant for someone else.
    await social.answerFollowRequest(c, b.userId, true);
    expect(await social.publicItems(b, a.userId)).toHaveLength(0);

    await social.answerFollowRequest(a, b.userId, true);
    expect((await social.profileByUsername(b, ua))?.visible).toBe(true);
    items = await social.publicItems(b, a.userId);
    expect(items.map((i) => i.title)).toEqual(["Public Book"]);
    expect(await social.publicItems(c, a.userId)).toHaveLength(0);
    expect((await listNotifications(b)).map((n) => n.kind)).toEqual(["follow_accepted"]);

    // Removed followers lose access at once.
    await social.removeFollower(a, b.userId);
    expect(await social.publicItems(b, a.userId)).toHaveLength(0);

    // Opening the profile answers whoever waits.
    await social.follow(c, a.userId, true);
    await social.setProfilePublic(a, true, null);
    expect((await social.profileByUsername(c, ua))?.isFollowing).toBe(true);
    await social.setItemVisibility(a, r1.id, true);

    // Taking a source: the public one only, and the owner hears of it.
    await expect(social.takeSource(b, r2.id, a.userId)).rejects.toThrow();
    await social.takeSource(b, r1.id, a.userId);
    const mine = await db
      .select({ id: learningRecords.id, visibility: learningRecords.visibility })
      .from(learningRecords)
      .where(eq(learningRecords.userId, b.userId));
    expect(mine).toHaveLength(1);
    expect(mine[0].visibility).toBe("private");
    expect((await listNotifications(a)).some((n) => n.kind === "copied")).toBe(true);

    const feed = await social.mediaFeed(c);
    expect(feed.some((i) => i.resourceId === r1.id && i.ownerId === a.userId)).toBe(true);
    expect(feed.some((i) => i.resourceId === r2.id)).toBe(false);
  });

  it("links the bot once, with a code that cannot be forged", async () => {
    const { botLinkCode, redeemBotLink } = await import("@/server/notifications");
    process.env.BETTER_AUTH_SECRET ||= "test-secret";
    const a = await makeUser(db);
    const tgId = Math.floor(Math.random() * 1e9) + 1e9;
    await db.insert(botUsers).values({ tgId });
    const code = botLinkCode(a.userId);
    const flip = code[0] === "A" ? "B" : "A";
    expect(await redeemBotLink(tgId, flip + code.slice(1))).toBeNull();
    expect(await redeemBotLink(tgId, botLinkCode(a.userId, Date.now() - 3_600_000))).toBeNull();
    expect(await redeemBotLink(tgId, code)).toBeTruthy();
    expect(await redeemBotLink(tgId, code)).toBeNull();
    const [row] = await db.select().from(botUsers).where(eq(botUsers.tgId, tgId));
    expect(row.userId).toBe(a.userId);
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

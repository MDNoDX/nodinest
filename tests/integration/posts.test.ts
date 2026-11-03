import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { bookTextSources, learningRecords, user } from "@/db/schema";
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
const tag = () => Math.random().toString(36).slice(2, 9);

async function person(open = true) {
  const u = await makeUser(db);
  const username = `p${tag()}`;
  await db.update(user).set({ username, profilePublic: open }).where(eq(user.id, u.userId));
  return { ...u, username };
}

describe("posts: likes, comments, a shared book text", () => {
  it("likes and comments only on public posts one may see; the owner may remove comments", async () => {
    const social = await import("@/server/social");
    const owner = await person();
    const fan = await person();
    const r = await submitResource(db, owner, { type: "book", title: `Post ${tag()}` });
    if (r.mode !== "applied") throw new Error("applied");
    // Adding a book puts it in the adder's library (private).
    const [rec] = await db
      .select({ id: learningRecords.id })
      .from(learningRecords)
      .where(eq(learningRecords.resourceId, r.id));
    // Private: nothing to like.
    await expect(social.setLike(fan, rec.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await social.setItemVisibility(owner, r.id, true);
    expect(await social.setLike(fan, rec.id, true)).toBe(1);
    expect(await social.setLike(fan, rec.id, true)).toBe(1); // once per person
    expect(await social.setLike(fan, rec.id, false)).toBe(0);
    await social.addComment(fan, rec.id, { body: "Zör kitob!" });
    const [c] = await social.listPostComments(owner, rec.id);
    expect(c).toMatchObject({ body: "Zör kitob!", canDelete: true, mine: false });
    await social.deleteComment(owner, c.id);
    expect(await social.listPostComments(fan, rec.id)).toHaveLength(0);
    const feed = await social.mediaFeed(fan);
    expect(feed.find((i) => i.recordId === rec.id)).toMatchObject({ likes: 0, comments: 0 });
  });

  it("a book text is read as the owner's only when they made it public", async () => {
    const social = await import("@/server/social");
    const owner = await person();
    const reader = await person();
    const r = await submitResource(db, owner, { type: "book", title: `Matn ${tag()}` });
    if (r.mode !== "applied") throw new Error("applied");
    await db
      .update(learningRecords)
      .set({ visibility: "public" })
      .where(eq(learningRecords.resourceId, r.id));
    await db
      .insert(bookTextSources)
      .values({ userId: owner.userId, resourceId: r.id, kind: "file", status: "ready", pages: 3 });
    await expect(social.sharedTextOwner(reader, owner.userId, r.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await social.shareState(owner, r.id)).text).toBe(false);
    await social.setItemVisibility(owner, r.id, true, { text: true });
    const as = await social.sharedTextOwner(reader, owner.userId, r.id);
    expect(as.userId).toBe(owner.userId);
    expect((await social.publicItem(reader, owner.username, r.id))?.textPublic).toBe(true);
  });
});

describe("a new public post rings for followers", () => {
  it("tells the people who follow me, once, when I open an item", async () => {
    const social = await import("@/server/social");
    const { listNotifications } = await import("@/server/notifications");
    const me = await person();
    const fan = await person();
    await social.follow(fan, me.userId, true);
    const r = await submitResource(db, me, { type: "book", title: `Yangi ${tag()}` });
    if (r.mode !== "applied") throw new Error("applied");
    await social.setItemVisibility(me, r.id, true);
    await new Promise((ok) => setTimeout(ok, 50));
    await social.setItemVisibility(me, r.id, true); // already public: no second ring
    await new Promise((ok) => setTimeout(ok, 50));
    const posts = (await listNotifications(fan)).filter((n) => n.kind === "post");
    expect(posts).toHaveLength(1);
  });

  it("the search finds posts by title or poster; a private profile's only for its followers", async () => {
    const social = await import("@/server/social");
    const open = await person();
    const closed = await person(false);
    const finder = await person();
    const word = `Qidir${tag()}`;
    for (const [who, type] of [
      [open, "book"],
      [closed, "podcast"],
    ] as const) {
      const r = await submitResource(db, who, { type, title: `${word} ${type}` });
      if (r.mode !== "applied") throw new Error("applied");
      await db
        .update(learningRecords)
        .set({ visibility: "public" })
        .where(eq(learningRecords.resourceId, r.id));
    }
    const titles = async (q: string, kind?: "book" | "podcast") =>
      (await social.searchMedia(finder, q, kind)).map((h) => h.title).sort();
    expect(await titles(word)).toEqual([`${word} book`]);
    expect(await titles(open.username)).toEqual([`${word} book`]);
    expect(await titles(word, "podcast")).toEqual([]);
    // Following the private profile (accepted) shows its posts too.
    await db.execute(
      sql`insert into nodinest.follows (follower_id, followee_id) values (${finder.userId}, ${closed.userId})`,
    );
    expect(await titles(word)).toEqual([`${word} book`, `${word} podcast`]);
    expect(await titles(word, "podcast")).toEqual([`${word} podcast`]);
    // My own posts are in my Darsxona, not here (and the private one is not followed).
    expect(await social.searchMedia(open, word)).toHaveLength(0);
  });

  it("sends of a public post are counted and the owner sees likes, comments and shares", async () => {
    const social = await import("@/server/social");
    const owner = await person();
    const fan = await person();
    const r = await submitResource(db, owner, { type: "book", title: `Ulaş ${tag()}` });
    if (r.mode !== "applied") throw new Error("applied");
    const [rec] = await db
      .select({ id: learningRecords.id })
      .from(learningRecords)
      .where(eq(learningRecords.resourceId, r.id));
    // Private: nothing to count, nothing to show.
    await expect(social.countShare(fan, rec.id, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await social.myPostStats(owner, r.id)).toBeNull();
    await social.setItemVisibility(owner, r.id, true);
    await social.countShare(fan, rec.id, 3);
    await social.countShare(fan, rec.id, 500); // at most 20 at a time
    await social.setLike(fan, rec.id, true);
    await social.addComment(fan, rec.id, { body: "Ajoyib" });
    expect(await social.myPostStats(owner, r.id)).toMatchObject({
      recordId: rec.id,
      shares: 23,
      likes: 1,
      comments: 1,
    });
    // Only the owner reads them here.
    expect(await social.myPostStats(fan, r.id)).toBeNull();
  });
});

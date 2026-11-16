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
const tag = () => Math.random().toString(36).slice(2, 9);

async function person() {
  const u = await makeUser(db);
  const username = `p${tag()}`;
  await db.update(user).set({ username, profilePublic: true }).where(eq(user.id, u.userId));
  return { ...u, username };
}

async function publicPost(owner: Awaited<ReturnType<typeof person>>) {
  const social = await import("@/server/social");
  const r = await submitResource(db, owner, { type: "book", title: `Post ${tag()}` });
  if (r.mode !== "applied") throw new Error("applied");
  await social.setItemVisibility(owner, r.id, true);
  const [rec] = await db
    .select({ id: learningRecords.id })
    .from(learningRecords)
    .where(eq(learningRecords.resourceId, r.id));
  return rec.id;
}

describe("comments like Instagram: likes, who liked, replies", () => {
  it("likes a comment once, lists who liked it, and the owner's like shows", async () => {
    const social = await import("@/server/social");
    const act = await import("@/server/activity");
    const owner = await person();
    const a = await person();
    const b = await person();
    const rec = await publicPost(owner);
    const cid = await social.addComment(a, rec, { body: "Ajoyib" });
    expect(await act.setCommentLike(b, cid, true)).toBe(1);
    expect(await act.setCommentLike(b, cid, true)).toBe(1);
    expect(await act.setCommentLike(owner, cid, true)).toBe(2);
    const [c] = await social.listPostComments(b, rec);
    expect(c).toMatchObject({ likes: 2, liked: true, ownerLiked: true });
    const who = await act.likers(a, "comment", cid);
    expect(who.map((p) => p.username).sort()).toEqual([b.username, owner.username].sort());
    expect(who.every((p) => !p.me)).toBe(true);
    expect((await act.likers(b, "comment", cid)).find((p) => p.me)?.username).toBe(b.username);
    expect(await act.setCommentLike(b, cid, false)).toBe(1);
    // The post's own likers too.
    await social.setLike(b, rec, true);
    expect((await act.likers(a, "post", rec)).map((p) => p.username)).toEqual([b.username]);
  });

  it("replies stay one level deep, name whom they answer, and go with their comment", async () => {
    const social = await import("@/server/social");
    const owner = await person();
    const a = await person();
    const b = await person();
    const rec = await publicPost(owner);
    const top = await social.addComment(a, rec, { body: "Savol" });
    const r1 = await social.addComment(b, rec, { body: "Javob" }, top);
    const r2 = await social.addComment(a, rec, { body: "Rahmat" }, r1);
    const list = await social.listPostComments(owner, rec);
    const byId = new Map(list.map((c) => [c.id, c]));
    expect(byId.get(r1)).toMatchObject({ parentId: top, replyTo: null });
    expect(byId.get(r2)).toMatchObject({ parentId: top, replyTo: { username: b.username } });
    // A reply to a comment of another post is refused.
    const other = await publicPost(owner);
    await expect(social.addComment(a, other, { body: "x" }, top)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // The top comment's writer removes it: the replies go with it.
    await social.deleteComment(a, top);
    expect(await social.listPostComments(owner, rec)).toHaveLength(0);
  });

  it("My activity lists and removes only my own likes and comments", async () => {
    const social = await import("@/server/social");
    const act = await import("@/server/activity");
    const owner = await person();
    const me = await person();
    const other = await person();
    const p1 = await publicPost(owner);
    const p2 = await publicPost(owner);
    await social.setLike(me, p1, true);
    await social.setLike(me, p2, true);
    await social.setLike(other, p1, true);
    const c1 = await social.addComment(me, p1, { body: "birinchi" });
    const c2 = await social.addComment(other, p1, { body: "boshqasi" });
    await act.setCommentLike(me, c2, true);

    const likes = await act.myActivity(me, { kind: "likes" });
    expect(likes.totals).toEqual({ likes: 2, comments: 1, commentLikes: 1 });
    expect(likes.items.map((i) => i.key)).toEqual([p2, p1]);
    expect((await act.myActivity(me, { kind: "likes", sort: "old" })).items[0].key).toBe(p1);
    expect(
      (await act.myActivity(me, { kind: "likes", from: "2000-01-01", to: "2000-12-31" })).items,
    ).toHaveLength(0);
    const comments = await act.myActivity(me, { kind: "comments" });
    expect(comments.items[0]).toMatchObject({ key: c1, body: "birinchi" });
    expect(comments.items[0].href).toContain(`?c=${c1}`);
    const cl = await act.myActivity(me, { kind: "commentLikes" });
    expect(cl.items[0]).toMatchObject({ key: c2, author: { username: other.username } });

    // Bulk removal touches only my rows (another person's like and comment stay).
    expect(await act.removeActivity(me, "likes", [p1, p2])).toBe(2);
    expect(await act.removeActivity(me, "comments", [c1, c2])).toBe(1);
    expect(await act.removeActivity(me, "commentLikes", [c2])).toBe(1);
    expect((await act.likers(owner, "post", p1)).map((p) => p.username)).toEqual([other.username]);
    expect((await social.listPostComments(owner, p1)).map((c) => c.id)).toEqual([c2]);
    expect((await act.myActivity(me, { kind: "likes" })).totals).toEqual({
      likes: 0,
      comments: 0,
      commentLikes: 0,
    });
  });
});

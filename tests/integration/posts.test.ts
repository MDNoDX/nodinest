import { eq } from "drizzle-orm";
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

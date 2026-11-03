import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { files, learningRecords, user } from "@/db/schema";
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
  const username = `m${tag()}`;
  await db.update(user).set({ username, profilePublic: open }).where(eq(user.id, u.userId));
  return { ...u, username };
}

describe("messages between two people", () => {
  it("talks, counts unread, reads, deletes; nobody else sees it", async () => {
    const dm = await import("@/server/dm");
    const { listNotifications } = await import("@/server/notifications");
    const a = await person();
    const b = await person();
    const c = await person();
    const id = await dm.openThread(a, b.username);
    expect(await dm.openThread(b, a.username)).toBe(id); // one conversation per pair

    const first = await dm.sendMessage(a, id, { body: "Salom, kitobni öqidingizmi?" });
    expect(first.body).toBe("Salom, kitobni öqidingizmi?");
    await dm.sendMessage(a, id, { body: "Yana bir savol" });
    expect(await dm.unreadChats(b)).toBe(1);
    const list = await dm.threadList(b);
    expect(list[0]).toMatchObject({ id, unread: 2, other: { id: a.userId } });
    // Messages stay in Chatlar: the bell does not list them.
    const rings = (await listNotifications(b)).filter((n) => n.kind === "message");
    expect(rings).toHaveLength(0);

    const view = await dm.threadView(b, id);
    expect(view.messages.map((m) => m.body)).toEqual([
      "Salom, kitobni öqidingizmi?",
      "Yana bir savol",
    ]);
    expect(await dm.unreadChats(b)).toBe(0);
    const reply = await dm.sendMessage(b, id, { body: "Ha", replyToId: first.id });
    expect(reply.reply).toMatchObject({ id: first.id, kind: "text" });

    // Someone else: not found, cannot read or write.
    await expect(dm.threadView(c, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(dm.sendMessage(c, id, { body: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await dm.threadList(c)).toHaveLength(0);

    // Polling: only what is new; a deletion reaches the other side.
    const since = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 5));
    const later = await dm.sendMessage(a, id, { body: "Yangi" });
    const polled = await dm.messagesAround(b, id, { after: since });
    expect(polled.messages.map((m) => m.id)).toEqual([later.id]);
    await expect(dm.deleteMessage(b, later.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await dm.deleteMessage(a, later.id);
    expect(await dm.deletedSince(b, id, since)).toEqual([later.id]);
    const after = await dm.threadView(b, id);
    expect(after.messages.at(-1)).toMatchObject({ id: later.id, deleted: true, body: null });

    // Search over my conversations.
    expect((await dm.searchMessages(b, "kitob")).map((m) => m.id)).toEqual([first.id]);
    expect(await dm.searchMessages(c, "kitob")).toHaveLength(0);
  });

  it("a private profile is written to only by people it follows or who follow it; a block stops both", async () => {
    const dm = await import("@/server/dm");
    const a = await person();
    const shy = await person(false);
    await expect(dm.openThread(a, shy.username)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const id = await dm.openThread(shy, a.username);
    await dm.sendMessage(shy, id, { body: "Men yozdim" });
    await dm.sendMessage(a, id, { body: "Javob" }); // the talk exists now
    await dm.setBlocked(a, shy.userId, true);
    await expect(dm.sendMessage(shy, id, { body: "?" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(dm.sendMessage(a, id, { body: "?" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await dm.threadView(a, id)).blockedByMe).toBe(true);
    await dm.setBlocked(a, shy.userId, false);
    await dm.sendMessage(shy, id, { body: "Yana" });
  });

  it("files and items: only my own file goes in; both sides may open it; an item can be taken", async () => {
    const dm = await import("@/server/dm");
    const { fileFor } = await import("@/server/storage");
    const a = await person();
    const b = await person();
    const c = await person();
    const addFile = async (ownerId: string) => {
      const [f] = await db
        .insert(files)
        .values({
          ownerId,
          bucket: "test",
          path: `t/${tag()}`,
          originalName: "ovoz.m4a",
          mimeType: "audio/mp4",
          sizeBytes: 10,
          purpose: "media",
          uploadedAt: new Date(),
        })
        .returning({ id: files.id });
      return f.id;
    };
    const id = await dm.openThread(a, b.username);
    const theirs = await addFile(c.userId);
    await expect(dm.sendMessage(a, id, { fileId: theirs })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const voice = await addFile(a.userId);
    expect(await fileFor(b, voice)).toBeNull();
    const m = await dm.sendMessage(a, id, { fileId: voice });
    expect(m.file).toMatchObject({ id: voice, mime: "audio/mp4" });
    expect((await fileFor(b, voice))?.id).toBe(voice);
    expect(await fileFor(c, voice)).toBeNull();
    expect((await dm.threadList(b))[0].last?.kind).toBe("voice");

    // A private item of mine can be sent; the other side takes only its card.
    const r = await submitResource(db, a, { type: "book", title: `Kitob ${tag()}` });
    if (r.mode !== "applied") throw new Error("applied");
    await db
      .insert(learningRecords)
      .values({ userId: a.userId, resourceId: r.id, status: "planned" })
      .onConflictDoNothing();
    await expect(
      dm.sendMessage(c, await dm.openThread(c, b.username), { resourceId: r.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const shared = await dm.sendMessage(a, id, { resourceId: r.id });
    expect(shared.item?.id).toBe(r.id);
    expect(await dm.takeShared(b, shared.id)).toBe(r.id);
    const got = await db
      .select({ v: learningRecords.visibility })
      .from(learningRecords)
      .where(eq(learningRecords.userId, b.userId));
    expect(got).toEqual([{ v: "private" }]);
  });
});

describe("clearing, GIFs, voices and presence", () => {
  it("clears for me only or for both; GIFs only from GIPHY; voice keeps its shape", async () => {
    const dm = await import("@/server/dm");
    const a = await person();
    const b = await person();
    const id = await dm.openThread(a, b.username);
    await dm.sendMessage(a, id, { body: "birinçi" });
    await expect(
      dm.sendMessage(a, id, {
        gif: { id: "x", url: "https://evil.example/x.gif", w: 10, h: 10 },
      }),
    ).rejects.toBeTruthy();
    const g = await dm.sendMessage(a, id, {
      gif: { id: "abc", url: "https://media2.giphy.com/media/abc/200.webp", w: 200, h: 150 },
    });
    expect(g.meta?.gif?.id).toBe("abc");
    expect((await dm.threadList(b))[0].last?.kind).toBe("gif");

    // Cleared for me: gone on my side, still there for the other.
    await dm.clearChat(a, id, false);
    expect((await dm.threadView(a, id)).messages).toHaveLength(0);
    expect((await dm.threadView(b, id)).messages).toHaveLength(2);
    await dm.sendMessage(b, id, { body: "yangi" });
    expect((await dm.threadView(a, id)).messages.map((m) => m.body)).toEqual(["yangi"]);
    // Cleared for both: nothing left anywhere.
    await dm.clearChat(b, id, true);
    expect((await dm.threadView(a, id)).messages).toHaveLength(0);
    expect((await dm.threadView(b, id)).messages).toHaveLength(0);
  });

  it("online is shown only when both show it", async () => {
    const dm = await import("@/server/dm");
    const a = await person();
    const b = await person();
    const id = await dm.openThread(a, b.username);
    await dm.touchSeen(b);
    expect((await dm.threadView(a, id)).other.seen).toBeTruthy();
    await dm.setShowOnline(a, false);
    // I hide mine: I do not see theirs either.
    expect((await dm.threadView(a, id)).other.seen).toBeNull();
    await dm.setShowOnline(a, true);
    await dm.setShowOnline(b, false);
    expect((await dm.threadView(a, id)).other.seen).toBeNull();
  });

  it("reactions: one per person, seen by both, changed or taken back; others cannot", async () => {
    const dm = await import("@/server/dm");
    const a = await person();
    const b = await person();
    const c = await person();
    const id = await dm.openThread(a, b.username);
    const m = await dm.sendMessage(a, id, { body: "Zör kitob ekan" });
    await dm.react(b, m.id, "👍");
    await dm.react(a, m.id, "❤️");
    await dm.react(b, m.id, "🔥"); // changes b's, not a second one
    const view = await dm.threadView(a, id);
    expect(view.reactions[m.id]).toEqual([
      { e: "❤️", u: a.userId },
      { e: "🔥", u: b.userId },
    ]);
    expect(view.reactedAt).not.toBeNull();
    // The poll brings them only when they changed since what the page knows.
    const quiet = await dm.messagesAround(a, id, {
      after: new Date().toISOString(),
      reactedAt: view.reactedAt!,
    });
    expect(quiet.reactions).toBeUndefined();
    await dm.react(b, m.id, null);
    const fresh = await dm.messagesAround(a, id, {
      after: new Date().toISOString(),
      reactedAt: view.reactedAt!,
    });
    expect(fresh.reactions?.[m.id]).toEqual([{ e: "❤️", u: a.userId }]);
    // Not a member: nothing to react to. Not an emoji: refused.
    await expect(dm.react(c, m.id, "👍")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(dm.react(a, m.id, "hello")).rejects.toBeTruthy();
    await expect(dm.react(a, m.id, "1")).rejects.toBeTruthy();
  });
});

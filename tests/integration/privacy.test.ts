import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import { bookPages, bookTextSources, conspectSections, learningRecords, notes } from "@/db/schema";
import { createSection, listSections, updateSection } from "@/server/conspect";
import { submitResource } from "@/server/suggestions";
import { deleteNote, getNote, listNotes, saveNote } from "@/server/notes";
import { universalSearch } from "@/server/search";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
let alice: Awaited<ReturnType<typeof makeUser>>;
let bob: Awaited<ReturnType<typeof makeUser>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
let aliceNoteId: string;
let resourceId: string;

beforeAll(async () => {
  alice = await makeUser(db);
  bob = await makeUser(db);
  admin = await makeUser(db, { role: "superadmin" });
  const r = await submitResource(db, admin, { type: "book", title: "Privacy Test Book" });
  if (r.mode !== "applied") throw new Error("expected applied");
  resourceId = r.id;
  aliceNoteId = await saveNote(db, alice, {
    kind: "note",
    title: "Secret diary",
    body: "zanjabil maxfiy fikrlar",
    resourceId,
  });
});
afterAll(async () => {
  await db.$client.end();
});

describe("cross-user privacy", () => {
  it("owner can read their private note", async () => {
    const n = await getNote(db, alice, aliceNoteId);
    expect(n?.note.body).toContain("maxfiy");
    expect(n?.isOwner).toBe(true);
  });

  it("another user cannot read a private note by id", async () => {
    expect(await getNote(db, bob, aliceNoteId)).toBeNull();
  });

  it("another user cannot update or delete a private note by id", async () => {
    await expect(
      saveNote(db, bob, { kind: "note", body: "hijacked" }, aliceNoteId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteNote(db, bob, aliceNoteId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const n = await getNote(db, alice, aliceNoteId);
    expect(n?.note.body).toBe("zanjabil maxfiy fikrlar");
  });

  it("private notes never appear in another user's search or list", async () => {
    const res = await universalSearch(db, bob, { q: "zanjabil" });
    expect(res.groups.notes?.total ?? 0).toBe(0);
    const pub = await universalSearch(db, bob, { q: "zanjabil", visibility: "public" });
    expect(pub.groups.notes?.total ?? 0).toBe(0);
    const list = await listNotes(db, bob, {});
    expect(list.items.find((i) => i.id === aliceNoteId)).toBeUndefined();
    const mine = await universalSearch(db, alice, { q: "zanjabil" });
    expect(mine.groups.notes?.total).toBe(1);
  });

  it("public notes are readable but not editable by others", async () => {
    const id = await saveNote(db, alice, {
      kind: "quote",
      quoteText: "Ilm — nur.",
      visibility: "public",
    });
    const seen = await getNote(db, bob, id);
    expect(seen?.isOwner).toBe(false);
    await expect(saveNote(db, bob, { kind: "quote", quoteText: "x" }, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("RLS blocks raw queries that forget the owner filter", async () => {
    // Even a query with NO where clause only returns the actor's rows.
    const rows = await withUser(db, bob, (tx) =>
      tx.select({ id: notes.id, userId: notes.userId }).from(notes),
    );
    expect(rows.every((r) => r.userId === bob.userId || r.id !== aliceNoteId)).toBe(true);
    expect(rows.find((r) => r.id === aliceNoteId)).toBeUndefined();
    const recs = await withUser(db, bob, (tx) => tx.select().from(learningRecords));
    expect(recs.every((r) => r.userId === bob.userId)).toBe(true);
  });

  it("RLS rejects inserting rows owned by someone else", async () => {
    await expect(
      withUser(db, bob, (tx) =>
        tx.insert(conspectSections).values({
          userId: alice.userId,
          resourceId,
          title: "Forged",
        }),
      ),
    ).rejects.toThrow();
  });

  it("konspekts and indexed book text stay private", async () => {
    const sid = await createSection(db, alice, resourceId, {
      title: "1-bob",
      content: "zanjabil konspekt",
    });
    expect(await listSections(db, bob, resourceId)).toEqual([]);
    await expect(updateSection(db, bob, sid, { title: "x", content: "y" })).rejects.toThrow();
    const [src] = await withUser(db, alice, (tx) =>
      tx
        .insert(bookTextSources)
        .values({
          userId: alice.userId,
          resourceId,
          kind: "url",
          url: "https://e.test/a.pdf",
          status: "ready",
          pages: 1,
        })
        .returning({ id: bookTextSources.id }),
    );
    await withUser(db, alice, (tx) =>
      tx.insert(bookPages).values({
        sourceId: src.id,
        userId: alice.userId,
        resourceId,
        page: 1,
        content: "zanjabil sahifa",
      }),
    );
    const bobSees = await universalSearch(db, bob, { q: "zanjabil" });
    expect(bobSees.groups.conspect?.total ?? 0).toBe(0);
    expect(bobSees.groups.booktext?.total ?? 0).toBe(0);
    const aliceSees = await universalSearch(db, alice, { q: "zanjabil", resourceId });
    expect(aliceSees.groups.conspect?.total).toBe(1);
    expect(aliceSees.groups.booktext?.total).toBe(1);
    expect(aliceSees.groups.booktext?.hits[0].href).toBe("https://e.test/a.pdf#page=1");
    const raw = await withUser(db, bob, (tx) => tx.select().from(bookPages));
    expect(raw.every((r) => r.userId === bob.userId)).toBe(true);
  });

  it("regular users cannot write to the shared catalog directly (RLS)", async () => {
    await expect(
      withUser(db, bob, (tx) =>
        tx.execute(sql`update nodinest.resources set title = 'pwned' where id = ${resourceId}`),
      ),
    ).resolves.toBeDefined();
    const [r] = await db.execute<{ title: string }>(
      sql`select title from nodinest.resources where id = ${resourceId}`,
    );
    expect(r.title).toBe("Privacy Test Book");
    await expect(
      withUser(db, bob, (tx) =>
        tx.execute(sql`insert into nodinest.people (full_name) values ('Injected')`),
      ),
    ).rejects.toThrow();
  });

  it("app role cannot change its own role column", async () => {
    await expect(
      withUser(db, bob, (tx) =>
        tx.execute(sql`update nodinest."user" set role = 'superadmin' where id = ${bob.userId}`),
      ),
    ).rejects.toThrow();
  });

  it("app role cannot read auth secrets", async () => {
    await expect(
      withUser(db, bob, (tx) => tx.execute(sql`select token from nodinest.session limit 1`)),
    ).rejects.toThrow();
    await expect(
      withUser(db, bob, (tx) => tx.execute(sql`select access_token from nodinest.account limit 1`)),
    ).rejects.toThrow();
  });
});

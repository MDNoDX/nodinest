import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPersonDetail, getResourceDetail, listResources, searchPeople } from "@/server/catalog";
import { submitPerson, submitResource, submitArchive } from "@/server/suggestions";
import { withUser } from "@/db/client";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
let admin: Awaited<ReturnType<typeof makeUser>>;
let user: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  admin = await makeUser(db, { role: "superadmin" });
  user = await makeUser(db);
});
afterAll(async () => {
  await db.$client.end();
});

describe("my library", () => {
  it("every type a user adds shows up in My library at once", async () => {
    for (const type of ["lecture", "book", "video", "course", "podcast"] as const) {
      const r = await submitResource(db, user, { type, title: `Mine ${type} ${Date.now()}` });
      expect(r.mode).toBe("applied");
      const id = (r as { id: string }).id;
      const mine = await listResources(db, user, { scope: "mine", type });
      expect(mine.items.map((i) => i.id)).toContain(id);
      expect(mine.items.find((i) => i.id === id)?.myStatus).toBe("planned");
      // Another user does not get it on their shelf.
      const theirs = await listResources(db, admin, { scope: "mine", type });
      expect(theirs.items.map((i) => i.id)).not.toContain(id);
    }
  });
});

describe("adding to a collection from inside it", () => {
  it("finds library items, marks what is already in, and never shows other users' notes", async () => {
    const { saveCollection, toggleCollectionItem, searchCollectionCandidates, saveNote } =
      await import("@/server/notes");
    const r = (await submitResource(db, user, {
      type: "lecture",
      title: `Cand lecture ${Date.now()}`,
    })) as {
      id: string;
    };
    const cid = await saveCollection(db, user, {
      name: "Cand test",
      description: "",
      ranked: false,
    });
    const empty = await searchCollectionCandidates(db, user, cid, { q: "", kind: "resource" });
    expect(empty.map((c) => c.id)).toContain(r.id);
    await toggleCollectionItem(db, user, cid, { resourceId: r.id }, true);
    const hit = await searchCollectionCandidates(db, user, cid, {
      q: "cand lecture",
      kind: "resource",
    });
    expect(hit.find((c) => c.id === r.id)?.added).toBe(true);
    await saveNote(db, admin, { kind: "quote", quoteText: "Admin only quote cand" });
    const notes = await searchCollectionCandidates(db, user, cid, {
      q: "admin only",
      kind: "note",
    });
    expect(notes).toHaveLength(0);
    await expect(
      searchCollectionCandidates(db, admin, cid, { q: "", kind: "resource" }),
    ).rejects.toThrow();
  });
});

describe("people & resources", () => {
  let navoiyId: string;
  let bookId: string;

  it("a user creates people and resources directly; relations work both ways", async () => {
    const p = await submitPerson(db, user, {
      fullName: "Alisher Navoiy",
      aliases: ["Nizomiddin Mir Alisher", "Navoi"],
      birthDate: "1441-02-09",
      deathDate: "1501-01-03",
      roles: ["author"],
    });
    expect(p.mode).toBe("applied");
    navoiyId = (p as { id: string }).id;
    const r = await submitResource(db, user, {
      type: "book",
      title: "Xamsa",
      contributors: [
        { personId: navoiyId, role: "author" },
        { newPersonName: "Test Translator", role: "translator" },
      ],
      identifiers: [{ scheme: "isbn13", value: "978-0-306-40615-7" }],
      book: { publisher: "Test", pageCount: 500 },
    });
    expect(r.mode).toBe("applied");
    bookId = (r as { id: string }).id;
    const detail = await getResourceDetail(db, user, bookId);
    expect(detail?.contributors.map((c) => c.fullName).sort()).toEqual([
      "Alisher Navoiy",
      "Test Translator",
    ]);
    expect(detail?.identifiers[0].value).toBe("9780306406157");
    const person = await getPersonDetail(db, user, navoiyId);
    expect(person?.works.map((w) => w.id)).toContain(bookId);
  });

  it("rejects invalid ISBN checksums and impossible dates", async () => {
    await expect(
      submitResource(db, user, {
        type: "book",
        title: "Bad ISBN",
        identifiers: [{ scheme: "isbn13", value: "9780306406158" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      submitPerson(db, user, { fullName: "Bad Date", birthDate: "1999-02-30" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      submitPerson(db, user, { fullName: "Reverse Life", birthDate: "1990", deathDate: "1980" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("autocomplete: prefix on name, word and alias, apostrophe-insensitive", async () => {
    await submitPerson(db, user, { fullName: "G‘afur G‘ulom" });
    await submitPerson(db, user, { fullName: "Mark Twain", aliases: ["Samuel Clemens"] });
    const m = await withUser(db, user, (tx) => searchPeople(tx, "m"));
    expect(m.map((h) => h.fullName)).toContain("Mark Twain");
    const nav = await withUser(db, user, (tx) => searchPeople(tx, "nav"));
    expect(nav[0].fullName).toBe("Alisher Navoiy");
    const g = await withUser(db, user, (tx) => searchPeople(tx, "gafur"));
    expect(g[0]?.fullName).toBe("G‘afur G‘ulom");
    const g2 = await withUser(db, user, (tx) => searchPeople(tx, "G'afur"));
    expect(g2[0]?.fullName).toBe("G‘afur G‘ulom");
    const alias = await withUser(db, user, (tx) => searchPeople(tx, "samuel"));
    expect(alias[0]).toMatchObject({ fullName: "Mark Twain", matchedAlias: "Samuel Clemens" });
  });

  it("detects duplicate people and resources", async () => {
    await expect(submitPerson(db, user, { fullName: "Alisher Navoiy" })).rejects.toMatchObject({
      code: "DUPLICATE",
    });
    await expect(submitPerson(db, user, { fullName: "alisher  navoiy" })).rejects.toMatchObject({
      code: "DUPLICATE",
    });
    await expect(submitResource(db, user, { type: "book", title: "Xamsa" })).rejects.toMatchObject({
      code: "DUPLICATE",
    });
    await expect(
      submitResource(db, user, {
        type: "book",
        title: "Different title",
        identifiers: [{ scheme: "isbn10", value: "0-306-40615-2" }],
      }),
    ).resolves.toBeDefined();
    await expect(
      submitResource(db, user, {
        type: "book",
        title: "Another",
        identifiers: [{ scheme: "isbn13", value: "9780306406157" }],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
    // Explicit override is allowed (e.g. a different edition).
    await expect(
      submitResource(db, user, { type: "book", title: "Xamsa" }, { allowDuplicate: true }),
    ).resolves.toMatchObject({ mode: "applied" });
  });

  it("library listing with filters", async () => {
    const res = await listResources(db, user, { q: "xams", type: "book" });
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.items.some((i) => i.contributors.includes("Alisher Navoiy"))).toBe(true);
    const byPerson = await listResources(db, user, { personId: navoiyId });
    expect(byPerson.items.map((i) => i.id)).toContain(bookId);
  });

  describe("personal catalogs", () => {
    it("own entries are edited directly", async () => {
      const out = await submitPerson(db, user, { fullName: "Hamid Olimjon", birthDate: "1909" });
      expect(out.mode).toBe("applied");
      const id = (out as { id: string }).id;
      const edit = await submitPerson(
        db,
        user,
        { fullName: "Hamid Olimjon", biography: "Shoir" },
        { id, allowDuplicate: true },
      );
      expect(edit).toMatchObject({ mode: "applied", id });
      expect((await getPersonDetail(db, user, id))?.person.biography).toBe("Shoir");
    });

    it("nobody else sees my entries (the admin does in admin mode)", async () => {
      const other = await makeUser(db);
      expect(await getResourceDetail(db, other, bookId)).toBeNull();
      expect(await getPersonDetail(db, other, navoiyId)).toBeNull();
      const list = await listResources(db, other, { q: "xams" });
      expect(list.items).toHaveLength(0);
      await expect(
        submitResource(db, other, { type: "book", title: "Hack" }, { id: bookId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await getResourceDetail(db, admin, bookId)).not.toBeNull();
    });

    it("everyone can add the same book to their own Darsxona", async () => {
      const other = await makeUser(db);
      const out = await submitResource(db, other, { type: "book", title: "Xamsa" });
      expect(out.mode).toBe("applied");
      expect((out as { id: string }).id).not.toBe(bookId);
    });

    it("removing someone else's entry only takes it out of my Darsxona", async () => {
      const r = await submitResource(db, admin, {
        type: "book",
        title: `Shared ${Math.random().toString(36).slice(2)}`,
      });
      const id = (r as { id: string }).id;
      await db.execute(sql`insert into nodinest.learning_records (user_id, resource_id, status)
        values (${user.userId}, ${id}, 'planned')`);
      expect(await getResourceDetail(db, user, id)).not.toBeNull();
      const out = await submitArchive(db, user, "resource", id, true);
      expect(out.mode).toBe("applied");
      expect(await getResourceDetail(db, user, id)).toBeNull();
      expect((await getResourceDetail(db, admin, id))?.resource.deletedAt).toBeNull();
    });
  });
});

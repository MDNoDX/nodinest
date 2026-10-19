import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPersonDetail, getResourceDetail, listResources, searchPeople } from "@/server/catalog";
import {
  listSuggestions,
  reviewSuggestion,
  submitPerson,
  submitResource,
  withdrawSuggestion,
  submitArchive,
  submitSuggestion,
} from "@/server/suggestions";
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

  it("superadmin creates people and resources directly; relations work both ways", async () => {
    const p = await submitPerson(db, admin, {
      fullName: "Alisher Navoiy",
      aliases: ["Nizomiddin Mir Alisher", "Navoi"],
      birthDate: "1441-02-09",
      deathDate: "1501-01-03",
      roles: ["author"],
    });
    expect(p.mode).toBe("applied");
    navoiyId = (p as { id: string }).id;
    const r = await submitResource(db, admin, {
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
      submitResource(db, admin, {
        type: "book",
        title: "Bad ISBN",
        identifiers: [{ scheme: "isbn13", value: "9780306406158" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      submitPerson(db, admin, { fullName: "Bad Date", birthDate: "1999-02-30" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      submitPerson(db, admin, { fullName: "Reverse Life", birthDate: "1990", deathDate: "1980" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("autocomplete: prefix on name, word and alias, apostrophe-insensitive", async () => {
    await submitPerson(db, admin, { fullName: "G‘afur G‘ulom" });
    await submitPerson(db, admin, { fullName: "Mark Twain", aliases: ["Samuel Clemens"] });
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
    await expect(submitPerson(db, admin, { fullName: "Alisher Navoiy" })).rejects.toMatchObject({
      code: "DUPLICATE",
    });
    await expect(submitPerson(db, admin, { fullName: "alisher  navoiy" })).rejects.toMatchObject({
      code: "DUPLICATE",
    });
    await expect(submitResource(db, admin, { type: "book", title: "Xamsa" })).rejects.toMatchObject(
      { code: "DUPLICATE" },
    );
    await expect(
      submitResource(db, admin, {
        type: "book",
        title: "Different title",
        identifiers: [{ scheme: "isbn10", value: "0-306-40615-2" }],
      }),
    ).resolves.toBeDefined();
    await expect(
      submitResource(db, admin, {
        type: "book",
        title: "Another",
        identifiers: [{ scheme: "isbn13", value: "9780306406157" }],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
    // Explicit override is allowed (e.g. a different edition).
    await expect(
      submitResource(db, admin, { type: "book", title: "Xamsa" }, { allowDuplicate: true }),
    ).resolves.toMatchObject({ mode: "applied" });
  });

  it("library listing with filters", async () => {
    const res = await listResources(db, user, { q: "xams", type: "book" });
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.items.some((i) => i.contributors.includes("Alisher Navoiy"))).toBe(true);
    const byPerson = await listResources(db, user, { personId: navoiyId });
    expect(byPerson.items.map((i) => i.id)).toContain(bookId);
  });

  describe("suggestions workflow", () => {
    it("anyone can add a new entry; they own it and may edit it directly", async () => {
      const out = await submitPerson(db, user, { fullName: "Hamid Olimjon", birthDate: "1909" });
      expect(out.mode).toBe("applied");
      const id = (out as { id: string }).id;
      const [row] = await db.execute<{ created_by: string }>(
        sql`select created_by from nodinest.people where id = ${id}`,
      );
      expect(row.created_by).toBe(user.userId);
      const edit = await submitPerson(
        db,
        user,
        { fullName: "Hamid Olimjon", biography: "Shoir" },
        { id, allowDuplicate: true },
      );
      expect(edit.mode).toBe("applied");
      expect((await getPersonDetail(db, user, id))?.canEdit).toBe(true);
      // Another regular user's edit of the same entry is only a suggestion.
      const other = await makeUser(db);
      const foreign = await submitPerson(
        db,
        other,
        { fullName: "Hamid Olimjon", biography: "Changed" },
        { id, allowDuplicate: true },
      );
      expect(foreign.mode).toBe("suggested");
      expect((await getPersonDetail(db, user, id))?.person.biography).toBe("Shoir");
    });

    it("an explicit create suggestion stays pending until reviewed", async () => {
      const before = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from nodinest.people`,
      );
      await submitSuggestion(db, user, {
        operation: "create",
        targetType: "person",
        payload: { fullName: "Abdulla Qodiriy", birthDate: "1894" },
      });
      const after = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from nodinest.people`,
      );
      expect(after[0].n).toBe(before[0].n);
      const mine = await listSuggestions(db, user, { scope: "mine" });
      expect(mine[0].status).toBe("pending");
    });

    it("regular user cannot approve suggestions", async () => {
      const mine = await listSuggestions(db, user, { scope: "mine" });
      await expect(reviewSuggestion(db, user, mine[0].id, "approve")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("users cannot see others' suggestions", async () => {
      const other = await makeUser(db);
      const list = await listSuggestions(db, other, { scope: "all" });
      expect(list.length).toBe(0);
    });

    it("superadmin approval applies the change transactionally and audits it", async () => {
      const mine = await listSuggestions(db, user, { scope: "mine", status: "pending" });
      const s = mine.find(
        (x) => (x.payload as { fullName?: string }).fullName === "Abdulla Qodiriy",
      )!;
      const { appliedTargetId } = await reviewSuggestion(db, admin, s.id, "approve", "OK");
      expect(appliedTargetId).toBeTruthy();
      const p = await getPersonDetail(db, user, appliedTargetId!);
      expect(p?.person.fullName).toBe("Abdulla Qodiriy");
      expect(p?.person.birthDate).toBe("1894");
      await expect(reviewSuggestion(db, admin, s.id, "approve")).rejects.toMatchObject({
        code: "CONFLICT",
      });
      const audit = await db.execute<{ action: string }>(
        sql`select action from nodinest.audit_logs where entity_id = ${s.id}`,
      );
      expect(audit.map((a) => a.action)).toContain("suggestion.approve");
    });

    it("update suggestions keep a base snapshot and do not change the record until approved", async () => {
      const p = await submitPerson(
        db,
        user,
        { fullName: "Alisher Navoiy", biography: "Edited bio" },
        { id: navoiyId, allowDuplicate: true },
      );
      expect(p.mode).toBe("suggested");
      const person = await getPersonDetail(db, user, navoiyId);
      expect(person?.person.biography).toBeNull();
      const s = (await listSuggestions(db, admin, { scope: "all", status: "pending" })).find(
        (x) => x.targetId === navoiyId,
      )!;
      await reviewSuggestion(db, admin, s.id, "reject", "No source");
      const again = await getPersonDetail(db, user, navoiyId);
      expect(again?.person.biography).toBeNull();
    });

    it("withdraw only own pending suggestions", async () => {
      const out = await submitArchive(db, user, "resource", bookId, true, "spam?");
      expect(out.mode).toBe("suggested");
      const other = await makeUser(db);
      const id = (out as { suggestionId: string }).suggestionId;
      await expect(withdrawSuggestion(db, other, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await withdrawSuggestion(db, user, id);
      const d = await getResourceDetail(db, user, bookId);
      expect(d?.resource.deletedAt).toBeNull();
    });

    it("approval re-checks duplicates", async () => {
      const out = await submitSuggestion(db, user, {
        operation: "create",
        targetType: "person",
        payload: { fullName: "Mark Twain" },
      });
      const id = (out as { suggestionId: string }).suggestionId;
      await expect(reviewSuggestion(db, admin, id, "approve")).rejects.toMatchObject({
        code: "DUPLICATE",
      });
    });
  });
});

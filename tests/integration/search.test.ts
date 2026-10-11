import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveNote } from "@/server/notes";
import { universalSearch } from "@/server/search";
import { submitPerson, submitResource } from "@/server/suggestions";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
let u: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  const admin = await makeUser(db, { role: "superadmin" });
  u = await makeUser(db);
  const p = await submitPerson(db, admin, {
    fullName: "Yuval Noah Harari",
    shortDescription: "Historian",
  });
  await submitResource(db, admin, {
    type: "book",
    title: "Sapiens: A Brief History of Humankind",
    description: "How Homo sapiens came to dominate the world.",
    publicationDate: "2011",
    contributors: [{ personId: (p as { id: string }).id, role: "author" }],
  });
  await submitResource(db, admin, {
    type: "lecture",
    title: "O‘zbek adabiyoti tarixi",
    media: { transcript: "Bugungi ma’ruzada mumtoz she’riyat va aruz vazni haqida gaplashamiz." },
  });
  await saveNote(db, u, {
    kind: "quote",
    quoteText: "History is something that very few people have been doing.",
    tags: ["tarix"],
  });
});
afterAll(async () => {
  await db.$client.end();
});

describe("universal search", () => {
  it("finds resources by partial, case-insensitive title and by author", async () => {
    const r = await universalSearch(db, u, { q: "sapi" });
    expect(r.groups.resources?.hits[0].title).toMatch(/Sapiens/);
    const byAuthor = await universalSearch(db, u, { q: "harari", group: "resources" });
    expect(byAuthor.groups.resources?.hits[0].title).toMatch(/Sapiens/);
  });

  it("handles Uzbek apostrophe variants", async () => {
    for (const q of ["o'zbek adabiyoti", "o‘zbek", "ozbek", "O`ZBEK"]) {
      const r = await universalSearch(db, u, { q, group: "resources" });
      expect(r.groups.resources?.hits[0]?.title, q).toBe("O‘zbek adabiyoti tarixi");
    }
  });

  it("searches transcripts with snippets", async () => {
    const r = await universalSearch(db, u, { q: "aruz vazni", group: "transcripts" });
    expect(r.groups.transcripts?.hits[0].snippet.some((p) => p.match && /aruz/i.test(p.text))).toBe(
      true,
    );
  });

  it("uses AND semantics, so unrelated docs sharing one word don't match", async () => {
    const r = await universalSearch(db, u, { q: "history dominate" });
    expect(r.groups.resources?.total).toBe(1);
    const none = await universalSearch(db, u, { q: "history zebra" });
    expect(none.groups.resources?.total ?? 0).toBe(0);
  });

  it("filters by resource type and searches own quotes and tags", async () => {
    const r = await universalSearch(db, u, {
      q: "history",
      group: "resources",
      resourceType: "lecture",
    });
    expect(r.groups.resources?.total ?? 0).toBe(0);
    const q = await universalSearch(db, u, { q: "very few people" });
    expect(q.groups.quotes?.total).toBe(1);
    const t = await universalSearch(db, u, { q: "tar", group: "tags" });
    expect(t.groups.tags?.hits.map((h) => h.title)).toContain("#tarix");
  });

  it("ignores tsquery syntax injection", async () => {
    const r = await universalSearch(db, u, { q: "sapiens & | ! :* ( )" });
    expect(r.groups.resources?.hits[0]?.title).toMatch(/Sapiens/);
    const empty = await universalSearch(db, u, { q: "&|!" });
    expect(Object.keys(empty.groups).length).toBe(0);
  });
});

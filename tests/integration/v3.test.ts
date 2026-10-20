import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookDetails, categories, mediaDetails } from "@/db/schema";
import { getResourceDetail } from "@/server/catalog";
import { getPublisherDetail, savePublisher } from "@/server/publishers";
import { setLearningStatus } from "@/server/records";
import { universalSearch } from "@/server/search";
import { submitPerson, submitResource } from "@/server/suggestions";
import { getWriteup, saveWriteup, writeToWriteup } from "@/server/writeups";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
let u: Awaited<ReturnType<typeof makeUser>>;
let other: Awaited<ReturnType<typeof makeUser>>;
const tag = Date.now().toString(36);

beforeAll(async () => {
  u = await makeUser(db);
  other = await makeUser(db);
});
afterAll(async () => {
  await db.$client.end();
});

describe("publishers work like people", () => {
  let bookId: string;
  it("a typed publisher is created once and then reused", async () => {
    const a = await submitResource(db, u, {
      type: "book",
      title: `Ufq trilogiyasi ${tag}`,
      book: { publisherName: `Sharq ${tag}`, pageCount: 300 },
    });
    const b = await submitResource(db, u, {
      type: "book",
      title: `Kecha va kunduz ${tag}`,
      book: { publisherName: `  sharq ${tag} `, pageCount: 120 },
    });
    bookId = (a as { id: string }).id;
    const [pa] = await db.select().from(bookDetails).where(eq(bookDetails.resourceId, bookId));
    const [pb] = await db
      .select()
      .from(bookDetails)
      .where(eq(bookDetails.resourceId, (b as { id: string }).id));
    expect(pa.publisherId).toBeTruthy();
    expect(pb.publisherId).toBe(pa.publisherId);
    const d = await getPublisherDetail(db, u, pa.publisherId!);
    expect(d?.items.map((x) => x.title).sort()).toEqual(
      [`Ufq trilogiyasi ${tag}`, `Kecha va kunduz ${tag}`].sort(),
    );
    // My own publisher: I edit it; another user does not even see it.
    expect(d?.canEdit).toBe(true);
    expect(await getPublisherDetail(db, other, pa.publisherId!)).toBeNull();
    await expect(
      savePublisher(db, other, { name: "Hijack" }, pa.publisherId!),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await savePublisher(db, u, { name: `Sharq ${tag}`, city: "Toshkent" }, pa.publisherId!);
    await expect(savePublisher(db, u, { name: `SHARQ ${tag}` })).rejects.toMatchObject({
      code: "DUPLICATE",
    });
    const detail = await getResourceDetail(db, u, bookId);
    expect(detail?.book?.publisherName).toBe(`Sharq ${tag}`);
  });
});

describe("type-appropriate details", () => {
  it("courses keep lessons/duration/where, never book fields", async () => {
    const r = await submitResource(db, u, {
      type: "course",
      title: `Course ${tag}`,
      publicationDate: "2024-03",
      media: { channel: "Coursera", durationSeconds: 36_000, lessonCount: 42 },
      book: { pageCount: 999 },
    });
    const id = (r as { id: string }).id;
    const [m] = await db.select().from(mediaDetails).where(eq(mediaDetails.resourceId, id));
    expect(m).toMatchObject({ channel: "Coursera", lessonCount: 42, durationSeconds: 36_000 });
    expect(await db.select().from(bookDetails).where(eq(bookDetails.resourceId, id))).toHaveLength(
      0,
    );
  });
  it("approximate dates and centuries are stored as given", async () => {
    const p = await submitPerson(db, u, {
      fullName: `Imom G‘azzoliy ${tag}`,
      birthDate: "1058~",
      deathDate: "1111-12-19",
    });
    expect(p.mode).toBe("applied");
    const r = await submitResource(db, u, {
      type: "book",
      title: `Ihyo ${tag}`,
      originalDate: "1101/1200",
      publicationDate: "2019",
    });
    const d = await getResourceDetail(db, u, (r as { id: string }).id);
    expect(d?.resource.originalDate).toBe("1101/1200");
    await expect(
      submitPerson(db, u, { fullName: `Bad ${tag}`, birthDate: "1200/1100" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("taqriz", () => {
  let rid: string;
  beforeAll(async () => {
    rid = (
      (await submitResource(db, u, { type: "book", title: `Taqriz ${tag}` })) as { id: string }
    ).id;
  });
  it("detects edits made on another device", async () => {
    const first = await saveWriteup(db, u, rid, {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "birinchi" }] }],
    });
    const second = await saveWriteup(
      db,
      u,
      rid,
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "ikkinchi" }] }],
      },
      { baseUpdatedAt: first.updatedAt },
    );
    // A device that still holds the first version must not silently overwrite.
    await expect(
      saveWriteup(db, u, rid, { type: "doc", content: [] }, { baseUpdatedAt: first.updatedAt }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await saveWriteup(
      db,
      u,
      rid,
      { type: "doc", content: [] },
      {
        baseUpdatedAt: first.updatedAt,
        force: true,
      },
    );
    expect(second.words).toBe(1);
  });
  it("AI writes chapters (append / replace) as sanitised nodes", async () => {
    await writeToWriteup(db, u, rid, {
      chapter: "1-bob",
      markdown: "Birinchi fikr.",
      mode: "append",
    });
    await writeToWriteup(db, u, rid, { chapter: "2-bob", markdown: "- a\n- b", mode: "append" });
    await writeToWriteup(db, u, rid, {
      chapter: "1-bob",
      markdown: "Yangi **matn**.",
      mode: "replace_chapter",
    });
    const w = await getWriteup(db, u, rid);
    expect(w!.doc.content.map((n) => n.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "bulletList",
    ]);
    expect(JSON.stringify(w!.doc)).toContain("Yangi ");
    expect(JSON.stringify(w!.doc)).not.toContain("Birinchi fikr");
    const hits = await universalSearch(db, u, { q: "yangi matn", group: "taqriz" });
    expect(hits.groups.taqriz?.hits[0]?.href).toContain(`/library/${rid}/taqriz`);
  });
});

describe("search by genres and status (IMDb-style ribbons)", () => {
  it("browses without words: ALL selected genres, status and cover data", async () => {
    const [c1, c2] = await db
      .insert(categories)
      .values([
        { slug: `g1-${tag}`, nameUz: "Tarix", nameEn: "History" },
        { slug: `g2-${tag}`, nameUz: "Din", nameEn: "Religion" },
      ])
      .returning({ id: categories.id });
    const both = (
      (await submitResource(db, u, {
        type: "book",
        title: `Both genres ${tag}`,
        categoryIds: [c1.id, c2.id],
        coverUrl: "https://e.org/c.jpg",
      })) as { id: string }
    ).id;
    await submitResource(db, u, { type: "book", title: `Only one ${tag}`, categoryIds: [c1.id] });
    await setLearningStatus(db, u, both, "completed");

    const one = await universalSearch(db, u, { q: "", categoryIds: [c1.id] });
    expect(one.groups.resources?.total).toBe(2);
    const two = await universalSearch(db, u, { q: "", categoryIds: [c1.id, c2.id] });
    expect(two.groups.resources?.hits.map((h) => h.id)).toEqual([both]);
    expect(two.groups.resources?.hits[0]).toMatchObject({
      status: "completed",
      cover: "https://e.org/c.jpg",
    });
    // What you add lands on your "planned" shelf at once.
    const planned = await universalSearch(db, u, {
      q: "",
      categoryIds: [c1.id],
      status: "planned",
    });
    expect(planned.groups.resources?.hits.map((h) => h.title)).toEqual([`Only one ${tag}`]);
    // Another user does not see u's entries at all (personal catalogs).
    const theirs = await universalSearch(db, other, { q: "", categoryIds: [c1.id] });
    expect(theirs.groups.resources?.total ?? 0).toBe(0);
    const [{ n }] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from nodinest.resource_categories where category_id = ${c1.id}`,
    );
    expect(n).toBe(2);
  });
});

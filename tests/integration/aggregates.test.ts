import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listCategories } from "@/server/catalog";
import {
  getCollection,
  listCollections,
  listMyTags,
  reorderCollection,
  saveCollection,
  saveNote,
  toggleCollectionItem,
} from "@/server/notes";
import { listMyRecords, setLearningStatus, upsertLearningRecord } from "@/server/records";
import { getCollectionStats } from "@/server/stats";
import { listUsers } from "@/server/admin";
import { submitResource } from "@/server/suggestions";
import { categories } from "@/db/schema";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
let u: Awaited<ReturnType<typeof makeUser>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
let r1: string;
let r2: string;
let catId: string;

beforeAll(async () => {
  u = await makeUser(db);
  admin = await makeUser(db, { role: "superadmin" });
  [{ id: catId }] = await db
    .insert(categories)
    .values({ slug: `agg-${Date.now()}`, nameUz: "A", nameEn: "A" })
    .returning({ id: categories.id });
  r1 = (
    (await submitResource(db, u, {
      type: "book",
      title: "Aggregates One",
      categoryIds: [catId],
      book: { pageCount: 320 },
    })) as { id: string }
  ).id;
  r2 = (
    (await submitResource(db, u, {
      type: "book",
      title: "Aggregates Two Different",
      book: { pageCount: 180 },
    })) as {
      id: string;
    }
  ).id;
});
afterAll(async () => {
  await db.$client.end();
});

/** Regression: correlated subqueries must reference the outer row, not an inner table. */
describe("correlated counts", () => {
  it("tag counts", async () => {
    await saveNote(db, u, { kind: "note", body: "a", tags: ["alpha", "beta"] });
    await saveNote(db, u, { kind: "note", body: "b", tags: ["alpha"] });
    const tags = await listMyTags(db, u);
    expect(Object.fromEntries(tags.map((t) => [t.name, t.count]))).toEqual({ alpha: 2, beta: 1 });
  });

  it("collection counts", async () => {
    const [c] = await listCollections(db, u);
    await toggleCollectionItem(db, u, c.id, { resourceId: r1 }, true);
    await toggleCollectionItem(db, u, c.id, { resourceId: r2 }, true);
    const after = await listCollections(db, u);
    expect(after.find((x) => x.id === c.id)?.count).toBe(2);
  });

  it("category resource counts", async () => {
    const cats = await listCategories(db, u);
    expect(cats.find((c) => c.id === catId)?.count).toBe(1);
  });

  it("records, pages read and yearly stats", async () => {
    await upsertLearningRecord(db, u, {
      resourceId: r1,
      status: "completed",
      startedAt: "2025-12-20T08:30:00Z",
      completedAt: "2026-01-05T19:45:00Z",
      rating: 9,
    });
    await setLearningStatus(db, u, r2, "in_progress");
    await upsertLearningRecord(db, u, {
      resourceId: r2,
      status: "in_progress",
      progressCurrent: 40,
      progressTotal: 180,
      progressUnit: "pages",
    });
    const recs = await listMyRecords(db, u);
    expect(recs.find((r) => r.resourceId === r1)).toMatchObject({ status: "completed", rating: 9 });

    const all = await getCollectionStats(db, u, { timeZone: "Asia/Tashkent" });
    expect(all.totals).toMatchObject({ completed: 1, in_progress: 1, books_read: 1 });
    expect(all.totals.pages_read).toBe(320 + 40);
    const y2026 = await getCollectionStats(db, u, { timeZone: "Asia/Tashkent", year: 2026 });
    expect(y2026.totals.books_read).toBe(1);
    const y2025 = await getCollectionStats(db, u, { timeZone: "Asia/Tashkent", year: 2025 });
    expect(y2025.totals.books_read).toBe(0);
  });

  it("ranked collections keep the user's order", async () => {
    const cid = await saveCollection(db, u, { name: "Top 10", ranked: true });
    await toggleCollectionItem(db, u, cid, { resourceId: r1 }, true);
    await toggleCollectionItem(db, u, cid, { resourceId: r2 }, true);
    let d = (await getCollection(db, u, cid))!;
    expect(d.items.map((i) => i.resourceId)).toEqual([r1, r2]);
    await reorderCollection(db, u, cid, [d.items[1].id, d.items[0].id]);
    d = (await getCollection(db, u, cid))!;
    expect(d.collection.ranked).toBe(true);
    expect(d.items.map((i) => i.resourceId)).toEqual([r2, r1]);
    expect(d.items[1].myRating).toBe(9);
    // Someone else cannot reorder it.
    const other = await makeUser(db);
    await expect(reorderCollection(db, other, cid, [d.items[0].id])).rejects.toThrow();
  });

  it("admin user activity counts", async () => {
    const users = await listUsers(db, admin);
    const row = users.find((x) => x.id === u.userId)!;
    expect(row.notes).toBe(2);
    expect(row.records).toBe(2);
  });
});

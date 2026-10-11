import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listCategories } from "@/server/catalog";
import { listMyRecords, saveManualSession } from "@/server/journal";
import { listCollections, listMyTags, saveNote, toggleCollectionItem } from "@/server/notes";
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
    (await submitResource(db, admin, {
      type: "book",
      title: "Aggregates One",
      categoryIds: [catId],
    })) as { id: string }
  ).id;
  r2 = (
    (await submitResource(db, admin, { type: "book", title: "Aggregates Two Different" })) as {
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

  it("per-resource time totals", async () => {
    const day = 86400_000;
    await saveManualSession(db, u, {
      resourceId: r1,
      startedAt: new Date(Date.now() - 3 * day),
      endedAt: new Date(Date.now() - 3 * day + 600_000),
    });
    await saveManualSession(db, u, {
      resourceId: r2,
      startedAt: new Date(Date.now() - 2 * day),
      endedAt: new Date(Date.now() - 2 * day + 1200_000),
    });
    const { setLearningStatus } = await import("@/server/journal");
    await setLearningStatus(db, u, r1, "in_progress");
    await setLearningStatus(db, u, r2, "in_progress");
    const recs = await listMyRecords(db, u);
    expect(recs.find((r) => r.resourceId === r1)?.totalSeconds).toBe(600);
    expect(recs.find((r) => r.resourceId === r2)?.totalSeconds).toBe(1200);
  });

  it("admin user activity counts", async () => {
    const users = await listUsers(db, admin);
    const row = users.find((x) => x.id === u.userId)!;
    expect(row.notes).toBe(2);
    expect(row.sessions).toBe(2);
  });
});

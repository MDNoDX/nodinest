import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ownBooks, resources, writeups } from "@/db/schema";
import { makeUser, testDb } from "../helpers/db";

vi.mock("next/server", async (orig) => ({ ...(await orig()), after: (fn: () => void) => fn() }));
const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

describe("Röznoma", () => {
  it("lists what falls on a day, ticks, writes the day into the year's book, counts", async () => {
    const r = await import("@/server/roznoma");
    const u = await makeUser(db);
    const daily = await r.saveRoutine(u, { title: "Kitob öqiş", amount: "20 bet", time: "21:00" });
    await r.saveRoutine(u, { title: "Sport", repeat: "weekly", weekdays: [3] }); // Wednesdays
    await r.saveRoutine(u, { title: "Bir martalik", repeat: "once", onDay: "2026-09-09" });
    // 2026-09-09 is a Wednesday: all three; the 10th (Thursday): only the daily one.
    const wed = await r.getDay(u, "2026-09-09", "uz");
    expect(wed.items.map((i) => i.title).sort()).toEqual(["Bir martalik", "Kitob öqiş", "Sport"]);
    expect(wed.hijri).toBe("26 Rabiul-avval 1448");
    expect((await r.getDay(u, "2026-09-10", "uz")).items.map((i) => i.title)).toEqual([
      "Kitob öqiş",
    ]);
    await r.checkRoutine(u, daily, "2026-09-09", true, "35%");
    const after = await r.getDay(u, "2026-09-09", "uz");
    expect(after.done).toBe(1);
    expect(after.items.find((i) => i.id === daily)?.note).toBe("35%");

    const { bookId } = await r.saveDayLog(
      u,
      "2026-09-09",
      {
        motto: "Unumli ötkaz",
        title: "Yaxşi kun",
        story: "Bugun ko'p ish qildim.",
        highlights: ["Monitor sovğa qilişdi"],
        productiveMinutes: 150,
        better: true,
      },
      "uz",
    );
    const [book] = await db
      .select({ title: resources.title })
      .from(ownBooks)
      .innerJoin(resources, eq(resources.id, ownBooks.resourceId))
      .where(eq(ownBooks.resourceId, bookId));
    expect(book.title).toBe("Röznoma 2026");
    const [w] = await db
      .select({ plain: writeups.plain })
      .from(writeups)
      .where(and(eq(writeups.userId, u.userId), eq(writeups.resourceId, bookId)));
    expect(w.plain).toContain("Yaxşi kun");
    expect(w.plain).toContain("Monitor sovğa qilişdi");
    // Saving the same day again replaces its section (no duplicate).
    await r.saveDayLog(u, "2026-09-09", { title: "Ajoyib kun", highlights: [] }, "uz");
    const [w2] = await db
      .select({ plain: writeups.plain })
      .from(writeups)
      .where(and(eq(writeups.userId, u.userId), eq(writeups.resourceId, bookId)));
    expect(w2.plain).toContain("Ajoyib kun");
    expect(w2.plain).not.toContain("Yaxşi kun");
    // The motto stays on the next days.
    expect((await r.getDay(u, "2026-09-12", "uz")).motto).toBe(null);

    const h = await r.history(u, "2026-09-10", 3);
    expect(h.days.find((d) => d.day === "2026-09-09")).toMatchObject({ done: 1 });
  });

  it("step goals are achieved when every step is done", async () => {
    const r = await import("@/server/roznoma");
    const { listGoalsWithProgress } = await import("@/server/goals");
    const u = await makeUser(db);
    const g = await r.createStepGoal(u, { title: "Sertifikat", steps: ["Test", "Imtihon"] });
    let [goal] = await listGoalsWithProgress(db, u, "2026-10-01", "UTC");
    expect(goal).toMatchObject({ id: g, metric: "steps", value: 0, target: 2 });
    for (const s of goal.steps) await r.setGoalStep(u, s.id, true);
    [goal] = await listGoalsWithProgress(db, u, "2026-10-01", "UTC");
    expect(goal).toMatchObject({ value: 2, status: "achieved" });
    const other = await makeUser(db);
    await expect(r.addGoalStep(other, g, "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

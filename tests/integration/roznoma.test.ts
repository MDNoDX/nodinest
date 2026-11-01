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
    await r.checkRoutine(u, daily, "2026-09-09", { status: "done", note: "35%" });
    const after = await r.getDay(u, "2026-09-09", "uz");
    expect(after.done).toBe(1);
    expect(after.items.find((i) => i.id === daily)?.note2).toBe("35%");

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
    if (!bookId) throw new Error("no book");
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
    expect(w.plain).toContain("Sentabr");
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

    // Done partly: 10 of "20 bet" counts as half; inner items decide the parent.
    await r.checkRoutine(u, daily, "2026-09-10", { status: "partial", value: 10 });
    expect((await r.getDay(u, "2026-09-10", "uz")).percent).toBe(50);
    const parent = await r.saveRoutine(u, { title: "Qazo" });
    const asr = await r.saveRoutine(u, { title: "Asr", parentId: parent });
    await r.saveRoutine(u, { title: "Şom", parentId: parent });
    await r.checkRoutine(u, asr, "2026-09-11", { status: "done" });
    const qazo = (await r.getDay(u, "2026-09-11", "uz")).items.find((i) => i.id === parent);
    expect(qazo).toMatchObject({ status: "partial", value: 50 });
    expect(qazo?.subs).toHaveLength(2);

    // Taken off the day = kept; brought back with its amount; deleted only for good.
    await r.setArchived(u, [daily], true);
    expect((await r.getDay(u, "2026-09-10", "uz")).items.map((i) => i.id)).not.toContain(daily);
    await r.setArchived(u, [daily], false);
    const back = (await r.getDay(u, "2026-09-10", "uz")).items.find((i) => i.id === daily);
    expect(back).toMatchObject({ amount: "20 bet", time: "21:00" });
    await r.deleteRoutines(u, [parent]);
    expect((await r.listRoutines(u)).map((x) => x.id)).not.toContain(asr);

    const h = await r.history(u, "2026-09-10", 3);
    expect(h.days.find((d) => d.day === "2026-09-09")).toMatchObject({ done: 1 });
  });

  it("a new account gets an ordinary day and stored plans, once", async () => {
    const r = await import("@/server/roznoma");
    const u = await makeUser(db);
    await r.ensureDefaults(u, "uz");
    await r.ensureDefaults(u, "uz");
    const all = await r.listRoutines(u);
    expect(all.filter((x) => !x.archived).map((x) => x.title)).toContain("Badan tarbiya");
    expect(all.map((x) => x.title)).toHaveLength(4);
    const d = await r.getDay(u, "2026-11-01", "uz");
    expect(d.items.find((i) => i.prayer === "fajr")?.time).toMatch(/^0[45]:\d\d$/);
  });

  it("step goals are achieved when every step is done", async () => {
    const r = await import("@/server/roznoma");
    const { listGoalsWithProgress } = await import("@/server/goals");
    const u = await makeUser(db);
    const g = await r.createGoal(u, {
      title: "Sertifikat",
      kind: "study",
      dueOn: "2027-01-01",
      steps: [{ title: "Test" }, { title: "Imtihon", note: "9 gaça" }],
    });
    let [goal] = await listGoalsWithProgress(db, u, "2026-10-01", "UTC");
    expect(goal).toMatchObject({
      id: g,
      metric: "steps",
      value: 0,
      target: 2,
      dueOn: "2027-01-01",
    });
    for (const s of goal.steps) await r.setGoalStep(u, s.id, true);
    [goal] = await listGoalsWithProgress(db, u, "2026-10-01", "UTC");
    expect(goal).toMatchObject({ value: 2, status: "achieved" });
    const other = await makeUser(db);
    await expect(r.addGoalStep(other, g, { title: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

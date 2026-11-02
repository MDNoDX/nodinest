import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { files, ownBooks, resources, writeups } from "@/db/schema";
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
    const daily = await r.saveRoutine(u, {
      title: "Kitob öqiş",
      amount: "20 bet",
      time: "21:00",
      inJournal: true,
    });
    await r.saveRoutine(u, { title: "Sport", repeat: "weekly", weekdays: [3] }); // Wednesdays
    await r.saveRoutine(u, { title: "Bir martalik", repeat: "once", onDay: "2026-09-09" });
    // 2026-09-09 is a Wednesday: all three; the 10th (Thursday): only the daily one.
    const wed = await r.getDay(u, "2026-09-09");
    expect(wed.items.map((i) => i.title).sort()).toEqual(["Bir martalik", "Kitob öqiş", "Sport"]);
    expect((await r.getDay(u, "2026-09-10")).items.map((i) => i.title)).toEqual(["Kitob öqiş"]);
    await r.checkRoutine(u, daily, "2026-09-09", { status: "done", note: "35%" });
    const after = await r.getDay(u, "2026-09-09");
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
    // The day: its title, the date in italics, "Asosan:" and the plan in one line.
    const [wd] = await db
      .select({ doc: writeups.doc })
      .from(writeups)
      .where(and(eq(writeups.userId, u.userId), eq(writeups.resourceId, bookId)));
    type N = {
      type: string;
      attrs?: { level?: number };
      content?: { text: string; marks?: { type: string }[] }[];
    };
    const nodes = (wd.doc as { content: N[] }).content;
    const said = (n: N) => (n.content ?? []).map((c) => c.text).join("");
    const h3 = nodes.findIndex((n) => n.type === "heading" && n.attrs?.level === 3);
    expect(said(nodes[h3])).toBe("Yaxşi kun");
    expect(said(nodes[h3 + 1])).toMatch(/^9 · \S+/);
    expect(nodes[h3 + 1].content?.[0].marks).toEqual([{ type: "italic" }]);
    expect(nodes.some((n) => said(n) === "Asosan: Monitor sovğa qilişdi")).toBe(true);
    expect(nodes.some((n) => said(n) === "Kitob öqiş — 35%.")).toBe(true);
    expect(nodes.some((n) => said(n) === "⏳ Unumli: 2,5 soat | 16%")).toBe(true);
    // A day without a title has the date as its heading, and comes before the 9th.
    await r.saveDayLog(u, "2026-09-05", { story: "Erta kun." }, "uz");
    const [w5] = await db
      .select({ doc: writeups.doc })
      .from(writeups)
      .where(and(eq(writeups.userId, u.userId), eq(writeups.resourceId, bookId)));
    const days = (w5.doc as { content: N[] }).content
      .filter((n) => n.type === "heading" && n.attrs?.level === 3)
      .map(said);
    expect(days[0]).toMatch(/^5 · /);
    expect(days[1]).toBe("Yaxşi kun");
    // Saving the same day again replaces its section (no duplicate).
    await r.saveDayLog(u, "2026-09-09", { title: "Ajoyib kun", highlights: [] }, "uz");
    const [w2] = await db
      .select({ plain: writeups.plain })
      .from(writeups)
      .where(and(eq(writeups.userId, u.userId), eq(writeups.resourceId, bookId)));
    expect(w2.plain).toContain("Ajoyib kun");
    expect(w2.plain).not.toContain("Yaxşi kun");
    // The motto stays on the next days.
    expect((await r.getDay(u, "2026-09-12")).motto).toBe(null);

    // Done partly: 10 of "20 bet" counts as half; inner items decide the parent.
    await r.checkRoutine(u, daily, "2026-09-10", { status: "partial", value: 10 });
    expect((await r.getDay(u, "2026-09-10")).percent).toBe(50);
    const parent = await r.saveRoutine(u, { title: "Qazo" });
    const asr = await r.saveRoutine(u, { title: "Asr", parentId: parent });
    await r.saveRoutine(u, { title: "Şom", parentId: parent });
    await r.checkRoutine(u, asr, "2026-09-11", { status: "done" });
    const qazo = (await r.getDay(u, "2026-09-11")).items.find((i) => i.id === parent);
    expect(qazo).toMatchObject({ status: "partial", value: 50 });
    expect(qazo?.subs).toHaveLength(2);

    // Taken off the day = kept; brought back with its amount; deleted only for good.
    await r.setArchived(u, [daily], true);
    expect((await r.getDay(u, "2026-09-10")).items.map((i) => i.id)).not.toContain(daily);
    await r.setArchived(u, [daily], false);
    const back = (await r.getDay(u, "2026-09-10")).items.find((i) => i.id === daily);
    expect(back).toMatchObject({ amount: "20 bet", time: "21:00" });
    await r.deleteRoutines(u, [parent]);
    expect((await r.listRoutines(u)).map((x) => x.id)).not.toContain(asr);

    const h = await r.history(u, "2026-09-10", 3);
    expect(h.days.find((d) => d.day === "2026-09-09")).toMatchObject({ done: 1 });
  });

  it("a day told aloud goes into the book as sound; someone else's file does not", async () => {
    const r = await import("@/server/roznoma");
    const u = await makeUser(db);
    const addFile = async (ownerId: string) => {
      const [f] = await db
        .insert(files)
        .values({
          ownerId,
          bucket: "test",
          path: `t/${Math.random()}`,
          originalName: "kun.m4a",
          mimeType: "audio/mp4",
          sizeBytes: 10,
          purpose: "media",
        })
        .returning({ id: files.id });
      return f.id;
    };
    const fileId = await addFile(u.userId);
    const clip = { fileId, name: "kun.m4a", seconds: 12 };
    const { bookId } = await r.saveDayLog(u, "2026-09-11", { audio: [clip] }, "uz");
    expect((await r.getDay(u, "2026-09-11")).log.audio).toEqual([clip]);
    const [w] = await db
      .select({ doc: writeups.doc })
      .from(writeups)
      .where(and(eq(writeups.userId, u.userId), eq(writeups.resourceId, bookId!)));
    expect(JSON.stringify(w.doc)).toContain(`"fileId":"${fileId}"`);

    const other = await makeUser(db);
    await expect(r.saveDayLog(other, "2026-09-11", { audio: [clip] }, "uz")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("a new account gets an ordinary day and stored plans, once", async () => {
    const r = await import("@/server/roznoma");
    const u = await makeUser(db);
    await r.ensureDefaults(u, "uz");
    await r.ensureDefaults(u, "uz");
    const all = await r.listRoutines(u);
    expect(all.filter((x) => !x.archived).map((x) => x.title)).toContain("Badan tarbiya");
    expect(all.map((x) => x.title)).toHaveLength(4);
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

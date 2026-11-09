import { afterAll, describe, expect, it } from "vitest";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

describe("changing and deleting a goal", () => {
  it("renames, reorders, removes and adds steps; deletes only one's own", async () => {
    const r = await import("@/server/roznoma");
    const { listGoalsWithProgress } = await import("@/server/goals");
    const a = await makeUser(db);
    const b = await makeUser(db);
    const id = await r.createGoal(a, {
      title: "IELTS",
      kind: "study",
      steps: [{ title: "Listening" }, { title: "Reading" }, { title: "Writing" }],
    });
    const get = async () =>
      (await listGoalsWithProgress(db, a, "2026-11-09", "UTC")).find((g) => g.id === id)!;
    const [s1, s2] = (await get()).steps;
    await r.setGoalStep(a, s1.id, true);

    await r.updateGoal(a, id, {
      title: "IELTS 7.0",
      kind: "language",
      dueOn: "2027-03-01",
      steps: [
        { id: s2.id, title: "Reading 8" },
        { id: s1.id, title: "Listening" },
        { title: "Mock" },
      ],
    });
    const g = await get();
    expect(g).toMatchObject({ title: "IELTS 7.0", kind: "language", dueOn: "2027-03-01" });
    expect(g.steps.map((s) => [s.title, s.done])).toEqual([
      ["Reading 8", false],
      ["Listening", true], // kept its tick
      ["Mock", false],
    ]);
    // Someone else can neither change nor delete it.
    await expect(r.updateGoal(b, id, { title: "x", steps: [] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await r.removeGoal(b, id);
    expect(await get()).toBeTruthy();
    await r.removeGoal(a, id);
    expect(await get()).toBeUndefined();
  });
});

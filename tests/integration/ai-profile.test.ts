import { afterAll, describe, expect, it, vi } from "vitest";
import { makeUser, testDb } from "../helpers/db";

// The model is faked: this checks every query behind a conversation, as the app's own role.
vi.mock("@/server/ai/gemini", async (orig) => ({
  ...(await orig<typeof import("@/server/ai/gemini")>()),
  isAiConfigured: () => true,
  generate: vi.fn(async () => ({ text: "Salom!", functionCalls: [], candidates: [] })),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig()), after: (fn: () => void) => fn() }));

const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

describe("assistant", () => {
  it("answers a user with plans and goals (every profile query is valid)", async () => {
    const { runAssistant } = await import("@/server/ai/assistant");
    const { createGoal, saveRoutine } = await import("@/server/roznoma");
    const u = await makeUser(db);
    await saveRoutine(u, { title: "Kitob öqiş", amount: "20 bet" });
    await createGoal(u, { title: "IELTS", steps: [{ title: "Test" }] });
    const r = await runAssistant(u, { message: "Salom", locale: "uz", timeZone: "Asia/Tashkent" });
    expect(r.reply).toBe("Salom!");
  });
});

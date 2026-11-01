import { eq } from "drizzle-orm";
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

  it("saves the words of a spoken question, and nothing for mere noise", async () => {
    const { runAssistant } = await import("@/server/ai/assistant");
    const { aiConversations, aiMessages } = await import("@/db/schema");
    const u = await makeUser(db);
    const ask = (heard: string) =>
      runAssistant(u, {
        message: "…",
        audio: { mimeType: "audio/webm", data: "AAAA" },
        heard: Promise.resolve(heard),
        spoken: true,
        locale: "uz",
        timeZone: "Asia/Tashkent",
      });
    const said = await ask("Bugun nima öqiy?");
    const rows = await db
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, said.conversationId));
    expect(rows.map((m) => m.role).sort()).toEqual(["model", "user"]);
    expect(rows.find((m) => m.role === "user")?.content).toBe("Bugun nima öqiy?");
    const [c] = await db
      .select({ title: aiConversations.title })
      .from(aiConversations)
      .where(eq(aiConversations.id, said.conversationId));
    expect(c.title).toBe("Bugun nima öqiy?");

    const noise = await ask("");
    expect(noise.reply).toBe("");
    expect(
      await db
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(eq(aiConversations.id, noise.conversationId)),
    ).toHaveLength(0);
  });
});

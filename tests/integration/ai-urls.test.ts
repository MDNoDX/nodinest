import { describe, expect, it } from "vitest";

describe("URLs the AI may open", () => {
  it("only what the user gave, or reference sites", async () => {
    const { assertUrlAllowed } = await import("@/server/ai/tools/helpers");
    const env = { timeZone: "UTC", locale: "uz", userText: "see https://blog.example.com/a" };
    expect(() => assertUrlAllowed("https://blog.example.com/a", env)).not.toThrow();
    expect(() => assertUrlAllowed("https://uz.wikipedia.org/wiki/Navoiy", env)).not.toThrow();
    expect(() => assertUrlAllowed("https://evil.test/?d=my-notes", env)).toThrow();
    expect(() => assertUrlAllowed("https://wikipedia.org.evil.test/x", env)).toThrow();
  });
});

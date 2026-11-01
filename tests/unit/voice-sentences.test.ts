import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/ai/assistant", () => ({ runAssistant: vi.fn() }));
vi.mock("@/server/ai/gemini", () => ({ generate: vi.fn() }));
vi.mock("@/server/ai/speech", () => ({ MAX_TURN_CHARS: 1500, talkVoice: vi.fn() }));
vi.mock("@/server/premium", () => ({ limitsFor: vi.fn() }));
vi.mock("@/server/rate-limit", () => ({ hitRateLimit: vi.fn() }));

describe("nextSentences", () => {
  it("waits for a finished sentence that is long enough", async () => {
    const { nextSentences } = await import("@/server/ai/voice");
    expect(nextSentences("Salom, qale", 12)).toBeNull();
    expect(nextSentences("Salom! Yaxshimisiz", 12)).toBeNull();
    expect(nextSentences("Salom, yaxshimisiz? Men", 12)).toBe(20);
    expect(nextSentences("Salom. Bugun nima qildingiz? Ayt", 12)).toBe(29);
  });
});

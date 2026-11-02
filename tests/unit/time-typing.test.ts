import { describe, expect, it } from "vitest";
import { typedDigits } from "@/components/roznoma/time-field";

describe("typing a time", () => {
  it("keeps what is typed, and a key into a full box starts it again", () => {
    expect(typedDigits("1", "")).toBe("1");
    expect(typedDigits("17", "1")).toBe("17");
    // "00" shown, caret at the end: 4 then 3 → 43 (not 00).
    expect(typedDigits("004", "00")).toBe("4");
    expect(typedDigits("43", "4")).toBe("43");
    // Caret at the start of a full box.
    expect(typedDigits("517", "17")).toBe("5");
    expect(typedDigits("a7", "")).toBe("7");
  });
});

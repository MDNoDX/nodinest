import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOAL_ICON, PICKER_ICONS, guessIcon, iconKey } from "@/lib/plan-icons";

describe("plan icons", () => {
  it("guesses from a title in any alphabet", () => {
    expect(guessIcon("Bomdod namozi")).toBe("mosque");
    expect(guessIcon("Şom")).toBe("mosque");
    expect(guessIcon("Duo")).toBe("dua");
    expect(guessIcon("Zikr")).toBe("beads");
    expect(guessIcon("Kitob öqiş")).toBe("book");
    expect(guessIcon("Kitob yozish")).toBe("pen");
    expect(guessIcon("Push-Up")).toBe("dumbbell");
    expect(guessIcon("Подъём")).toBe("sunrise");
    expect(guessIcon("Lorem")).toBe("pin");
  });
  it("lets an added icon win for its words", () => {
    const added = [{ id: "abc123abc123", name: "Tasbeh", words: "tasbeh, zikr" }];
    expect(guessIcon("Zikr aytish", added)).toBe("c:abc123abc123");
  });
  it("has a picture for everything it offers and for old keys", () => {
    for (const k of [...PICKER_ICONS, ...Object.values(GOAL_ICON)])
      expect(existsSync(`public/plan-icons/${k}.svg`), k).toBe(true);
    expect(iconKey("heartpulse")).toBe("doctor");
    expect(iconKey(null)).toBe("pin");
    expect(iconKey("gone")).toBe("pin");
  });
});

describe("added icons are only pictures", () => {
  // cleanSvg lives on the server; the rule is tested through its pattern.
  const BAD =
    /<(script|foreignObject|iframe|image|use|a)\b|\son\w+\s*=|javascript:|data:|https?:\/\/(?!www\.w3\.org)/i;
  it("refuses anything that could run or reach out", () => {
    expect(BAD.test("<svg><script>alert(1)</script></svg>")).toBe(true);
    expect(BAD.test('<svg onload="x"></svg>')).toBe(true);
    expect(BAD.test('<svg><image href="https://evil.test/a"/></svg>')).toBe(true);
    expect(BAD.test('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')).toBe(false);
  });
});

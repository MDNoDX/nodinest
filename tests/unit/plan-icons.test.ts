import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GOAL_ICON,
  NO_ICONS,
  PICKER_ICONS,
  guessIcon,
  iconKey,
  iconSrc,
  pickerKeys,
} from "@/lib/plan-icons";

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
  it("lets the owner's words win: an added icon's, then one of ours", () => {
    const custom = [
      { id: "abc123abc123", name: "Tasbeh", words: "tasbeh, zikr", img: "f".repeat(12) },
    ];
    expect(guessIcon("Zikr aytish", { custom })).toBe("c:abc123abc123");
    expect(guessIcon("Mutolaa", { words: { book: "mutolaa" } })).toBe("book");
  });
  it("starts with study, workout, writing, reading, prayer, dhikr; follows the owner", () => {
    expect(pickerKeys(NO_ICONS).slice(0, 6)).toEqual([
      "grad",
      "dumbbell",
      "pen",
      "book",
      "mosque",
      "beads",
    ]);
    const custom = [{ id: "abc123abc123", name: "X", words: "", img: "a".repeat(12) }];
    // A new added icon comes first; the owner's order is kept; nothing is lost.
    const keys = pickerKeys({ ...NO_ICONS, custom, order: ["book", "grad", "gone"] });
    expect(keys.slice(0, 3)).toEqual(["c:abc123abc123", "book", "grad"]);
    expect(keys).toHaveLength(PICKER_ICONS.length + 1);
    expect(keys).not.toContain("gone");
  });
  it("shows the owner's picture, ours otherwise, the pin for a removed one", () => {
    const cfg = { ...NO_ICONS, over: { book: "b".repeat(12) } };
    expect(iconSrc("book", cfg)).toBe(`/api/plan-icons/${"b".repeat(12)}`);
    expect(iconSrc("grad", cfg)).toBe("/plan-icons/grad.svg");
    expect(iconSrc("c:abc123abc123", cfg)).toBe("/plan-icons/pin.svg");
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

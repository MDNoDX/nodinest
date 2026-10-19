import { describe, expect, it } from "vitest";
import { SHORTCUTS, comboFrom, comboLabel, matches } from "@/lib/shortcuts";

const key = (code: string, o: Partial<KeyboardEvent> = {}) =>
  ({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...o }) as KeyboardEvent;

describe("shortcuts", () => {
  it("labels combos for Mac and other keyboards", () => {
    expect(comboLabel(SHORTCUTS.playPause, true)).toBe("⌥K");
    expect(comboLabel(SHORTCUTS.askAi, true)).toBe("⇧⌘E");
    expect(comboLabel(SHORTCUTS.chapter, false)).toBe("Ctrl+Alt+2");
  });
  it("matches by physical key and exact modifiers", () => {
    expect(matches(key("KeyK", { altKey: true }), SHORTCUTS.playPause)).toBe(true);
    expect(matches(key("KeyK", { altKey: true, shiftKey: true }), SHORTCUTS.playPause)).toBe(false);
    expect(matches(key("KeyK", { ctrlKey: true }), SHORTCUTS.search)).toBe(true);
  });
  it("refuses plain letters as new shortcuts", () => {
    expect(comboFrom(key("KeyK"))).toBeNull();
    expect(comboFrom(key("ShiftLeft", { shiftKey: true }))).toBeNull();
    expect(comboFrom(key("KeyP", { altKey: true }))).toEqual({
      code: "KeyP",
      mod: false,
      alt: true,
      shift: false,
    });
    expect(comboFrom(key("F8"))).not.toBeNull();
  });
});

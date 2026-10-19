"use client";
import { useSyncExternalStore } from "react";

/**
 * App keyboard shortcuts the user can change in Settings (stored on this
 * device). `mod` is ⌘ on Apple keyboards and Ctrl elsewhere; keys are matched
 * by physical position (`KeyboardEvent.code`), so ⌥ / Alt layouts that type
 * special characters still work.
 */
export type Combo = { code: string; mod: boolean; alt: boolean; shift: boolean };

export const SHORTCUTS = {
  playPause: { code: "KeyK", mod: false, alt: true, shift: false },
  back5: { code: "KeyJ", mod: false, alt: true, shift: false },
  fwd5: { code: "KeyL", mod: false, alt: true, shift: false },
  stamp: { code: "KeyT", mod: false, alt: true, shift: false },
  search: { code: "KeyK", mod: true, alt: false, shift: false },
  askAi: { code: "KeyE", mod: true, alt: false, shift: true },
  quote: { code: "KeyB", mod: true, alt: false, shift: true },
  chapter: { code: "Digit2", mod: true, alt: true, shift: false },
  subchapter: { code: "Digit3", mod: true, alt: true, shift: false },
} satisfies Record<string, Combo>;
export type ShortcutId = keyof typeof SHORTCUTS;
export type ShortcutMap = Record<ShortcutId, Combo>;

const KEY = "nn:shortcuts";
const EVENT = "nn:shortcuts";
let cache: { raw: string | null; value: ShortcutMap } | null = null;

export function getShortcuts(): ShortcutMap {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable */
  }
  if (cache && cache.raw === raw) return cache.value;
  let value: ShortcutMap = { ...SHORTCUTS };
  try {
    const saved = raw ? (JSON.parse(raw) as Partial<ShortcutMap>) : {};
    for (const id of Object.keys(SHORTCUTS) as ShortcutId[]) {
      const c = saved[id];
      if (c && typeof c.code === "string") value = { ...value, [id]: c };
    }
  } catch {
    /* ignore broken value */
  }
  cache = { raw, value };
  return value;
}

export function setShortcut(id: ShortcutId, combo: Combo | null) {
  const next = { ...getShortcuts() };
  next[id] = combo ?? SHORTCUTS[id];
  const changed = Object.fromEntries(
    (Object.keys(next) as ShortcutId[])
      .filter((k) => !same(next[k], SHORTCUTS[k]))
      .map((k) => [k, next[k]]),
  );
  try {
    if (Object.keys(changed).length) localStorage.setItem(KEY, JSON.stringify(changed));
    else localStorage.removeItem(KEY);
  } catch {
    cache = { raw: JSON.stringify(changed), value: next };
  }
  window.dispatchEvent(new Event(EVENT));
}

export function resetShortcuts() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  cache = null;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useShortcuts(): ShortcutMap {
  return useSyncExternalStore(subscribe, getShortcuts, () => SHORTCUTS);
}

export const isApple = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function useIsApple() {
  return useSyncExternalStore(
    () => () => {},
    isApple,
    () => false,
  );
}

export const same = (a: Combo, b: Combo) =>
  a.code === b.code && a.mod === b.mod && a.alt === b.alt && a.shift === b.shift;

export function matches(e: KeyboardEvent, c: Combo) {
  const apple = isApple();
  const mod = apple ? e.metaKey : e.ctrlKey;
  const other = apple ? e.ctrlKey : e.metaKey;
  return (
    e.code === c.code && mod === c.mod && e.altKey === c.alt && e.shiftKey === c.shift && !other
  );
}

/** Combo from a key press in the "change shortcut" recorder (null = not a usable key). */
export function comboFrom(e: KeyboardEvent): Combo | null {
  if (/^(Shift|Control|Alt|Meta|OS|CapsLock|Fn)/.test(e.code) || !e.code) return null;
  const apple = isApple();
  const c = {
    code: e.code,
    mod: apple ? e.metaKey : e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
  };
  // A plain letter would fire while typing: require ⌘/Ctrl or ⌥/Alt (F-keys excepted).
  if (!c.mod && !c.alt && !/^F\d+$/.test(c.code)) return null;
  return c;
}

const KEY_NAMES: Record<string, string> = {
  Space: "Space",
  Enter: "↩",
  Backspace: "⌫",
  Escape: "Esc",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
};

export function keyName(code: string) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num${code.slice(6)}`;
  return KEY_NAMES[code] ?? code;
}

export function comboLabel(c: Combo, apple: boolean) {
  if (apple) return `${c.alt ? "⌥" : ""}${c.shift ? "⇧" : ""}${c.mod ? "⌘" : ""}${keyName(c.code)}`;
  return [c.mod && "Ctrl", c.alt && "Alt", c.shift && "Shift", keyName(c.code)]
    .filter(Boolean)
    .join("+");
}

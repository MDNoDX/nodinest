"use client";
/**
 * The row of reactions over a message (and the double-tap one, the first),
 * chosen by the person: localStorage "nn:quick-reactions", per device.
 */
import { useSyncExternalStore } from "react";

const KEY = "nn:quick-reactions";
const EVENT = "nn:quick-reactions";
export const DEFAULT_QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥"];

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Always seven different emojis: the chosen ones, the default where one is missing. */
export function parseQuick(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "null") as unknown;
    if (Array.isArray(v)) {
      const list = [
        ...new Set(v.filter((x): x is string => typeof x === "string" && x.length <= 16)),
      ];
      for (const d of DEFAULT_QUICK)
        if (list.length < DEFAULT_QUICK.length && !list.includes(d)) list.push(d);
      return list.slice(0, DEFAULT_QUICK.length);
    }
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_QUICK;
}

export function useQuickReactions(): string[] {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  return parseQuick(raw);
}

export function writeQuickReactions(list: string[] | null) {
  try {
    if (list) localStorage.setItem(KEY, JSON.stringify(list.slice(0, DEFAULT_QUICK.length)));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

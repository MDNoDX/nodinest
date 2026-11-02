"use client";
/**
 * The phone's bottom bar, chosen by the person (Settings → Menu): up to four
 * sections next to "Menu" (localStorage "nn:phone-tabs", hrefs, per device).
 * A section shown at the bottom is not repeated in the menu, and the other way round.
 */
import { useSyncExternalStore } from "react";

const KEY = "nn:phone-tabs";
const EVENT = "nn:phone-tabs";
export const MAX_PHONE_TABS = 4;
export const DEFAULT_PHONE_TABS = ["/", "/library", "/media", "/chats"];

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

/** The chosen hrefs, in order (the default until the person changes them). */
export function usePhoneTabs(known: string[]): string[] {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  try {
    const v = JSON.parse(raw || "null") as unknown;
    if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === "string" && known.includes(x));
      return list.slice(0, MAX_PHONE_TABS);
    }
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_PHONE_TABS.filter((h) => known.includes(h));
}

export function writePhoneTabs(hrefs: string[] | null) {
  try {
    if (hrefs) localStorage.setItem(KEY, JSON.stringify(hrefs.slice(0, MAX_PHONE_TABS)));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

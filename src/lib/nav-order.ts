"use client";
/**
 * The order of the side menu, chosen by the user in Settings (per device,
 * localStorage "nn:nav-order" = hrefs). Items it doesn't know keep their place
 * at the end, so new sections still appear.
 */
import { useSyncExternalStore } from "react";

const KEY = "nn:nav-order";
const EVENT = "nn:nav-order";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeNavOrder(hrefs: string[] | null) {
  try {
    if (hrefs) localStorage.setItem(KEY, JSON.stringify(hrefs));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
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

/** The saved order (empty = the default one). */
export function useNavOrder(): string[] {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  try {
    const v = JSON.parse(raw || "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function sortByOrder<T extends { href: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items;
  const at = (h: string) => {
    const i = order.indexOf(h);
    return i < 0 ? order.length : i;
  };
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => at(a.it.href) - at(b.it.href) || a.i - b.i)
    .map((x) => x.it);
}

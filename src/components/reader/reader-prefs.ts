"use client";
import { useSyncExternalStore } from "react";

/**
 * How the reader likes to read (this device): text size, typeface, line
 * spacing, column width and paper (theme). Kept in localStorage.
 */
export type ReaderPrefs = {
  size: number;
  family: "serif" | "sans";
  leading: 1.5 | 1.75 | 2;
  width: "narrow" | "normal" | "wide";
  paper: "auto" | "white" | "sepia" | "night";
};

const KEY = "nn:reader-prefs";
const EVENT = "nn:reader-prefs";
export const DEFAULT_PREFS: ReaderPrefs = {
  size: 19,
  family: "serif",
  leading: 1.75,
  width: "normal",
  paper: "auto",
};

let cache: { raw: string | null; value: ReaderPrefs } | null = null;

function read(): ReaderPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable */
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULT_PREFS;
  try {
    const p = raw ? (JSON.parse(raw) as Partial<ReaderPrefs>) : {};
    // The older "text size only" setting carries over.
    const old = Number(localStorage.getItem("nn:reader-font"));
    value = {
      size: p.size && p.size >= 14 && p.size <= 28 ? p.size : old >= 15 && old <= 26 ? old : 19,
      family: p.family === "sans" ? "sans" : "serif",
      leading: p.leading === 1.5 || p.leading === 2 ? p.leading : 1.75,
      width: p.width === "narrow" || p.width === "wide" ? p.width : "normal",
      paper: (["white", "sepia", "night"] as const).includes(p.paper as "white")
        ? (p.paper as ReaderPrefs["paper"])
        : "auto",
    };
  } catch {
    /* broken value: defaults */
  }
  cache = { raw, value };
  return value;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function setReaderPrefs(patch: Partial<ReaderPrefs>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useReaderPrefs(): ReaderPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_PREFS);
}

/** Colours of each paper (the reading column and its background). */
export const PAPER: Record<
  Exclude<ReaderPrefs["paper"], "auto">,
  { bg: string; fg: string; muted: string }
> = {
  white: { bg: "#ffffff", fg: "#1f2328", muted: "#6b7280" },
  sepia: { bg: "#f4ecd8", fg: "#3b2f1e", muted: "#7a6a52" },
  night: { bg: "#121417", fg: "#d8d4cc", muted: "#8b8f97" },
};

export const WIDTH: Record<ReaderPrefs["width"], string> = {
  narrow: "34rem",
  normal: "40rem",
  wide: "48rem",
};

"use client";
import { useSyncExternalStore } from "react";

/**
 * How the reader likes to read (this device): text size, typeface, line
 * spacing and paper (theme). Kept in localStorage.
 */
export type ReaderPrefs = {
  size: number;
  family: "serif" | "sans";
  leading: 1.5 | 1.75 | 2;
  paper: "auto" | "white" | "sepia" | "night";
};

const KEY = "nn:reader-prefs";
const EVENT = "nn:reader-prefs";
export const DEFAULT_PREFS: ReaderPrefs = {
  size: 18,
  family: "serif",
  leading: 1.75,
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
      size: p.size && p.size >= 14 && p.size <= 28 ? p.size : old >= 15 && old <= 26 ? old : 18,
      family: p.family === "sans" ? "sans" : "serif",
      leading: p.leading === 1.5 || p.leading === 2 ? p.leading : 1.75,
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
  {
    bg: string;
    fg: string;
    muted: string;
    surface: string;
    surface2: string;
    border: string;
    primary: string;
    primaryFg: string;
    primarySoft: string;
  }
> = {
  white: {
    bg: "#ffffff",
    fg: "#1f2328",
    muted: "#5b6270",
    surface: "#ffffff",
    surface2: "#f1f2f4",
    border: "#e2e4e8",
    primary: "#4338ca",
    primaryFg: "#ffffff",
    primarySoft: "#ebe9fe",
  },
  sepia: {
    bg: "#f4ecd8",
    fg: "#3b2f1e",
    muted: "#6e5e47",
    surface: "#f8f1e0",
    surface2: "#eadfc6",
    border: "#dccfb2",
    primary: "#8a4b12",
    primaryFg: "#fff8ea",
    primarySoft: "#ecd9b6",
  },
  night: {
    bg: "#121417",
    fg: "#d8d4cc",
    muted: "#9a9ea6",
    surface: "#191c20",
    surface2: "#22262b",
    border: "#2b3036",
    primary: "#a5b4fc",
    primaryFg: "#12131c",
    primarySoft: "#252749",
  },
};

/** The whole reader takes its colours from the paper, not from the app's theme. */
export function paperVars(p: (typeof PAPER)[keyof typeof PAPER]) {
  return {
    "--background": p.bg,
    "--foreground": p.fg,
    "--muted-foreground": p.muted,
    "--surface": p.surface,
    "--surface-2": p.surface2,
    "--surface-3": p.surface2,
    "--border": p.border,
    "--border-strong": p.border,
    "--primary": p.primary,
    "--primary-hover": p.primary,
    "--primary-foreground": p.primaryFg,
    "--primary-soft": p.primarySoft,
    background: p.bg,
    color: p.fg,
  } as React.CSSProperties;
}

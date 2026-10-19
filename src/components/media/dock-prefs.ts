"use client";
import { useSyncExternalStore } from "react";

/**
 * Per-device preferences of the media dock (this browser only): whether the
 * shortcut hints are shown, audio-only mode, where the user dragged it and the
 * "pause while typing" behaviour.
 */
export type DockPrefs = {
  showKeys: boolean;
  audioOnly: boolean;
  /** Top-left corner in px; null = default bottom-right corner. */
  pos: { x: number; y: number } | null;
  /** Pause while the user types; resume `resumeAfter` seconds after the last key. */
  typePause: boolean;
  resumeAfter: number;
};

const KEY = "nn:dock-prefs";
const EVENT = "nn:dock-prefs";
const DEFAULTS: DockPrefs = {
  showKeys: true,
  audioOnly: false,
  pos: null,
  typePause: true,
  resumeAfter: 2,
};

let cache: { raw: string | null; value: DockPrefs } | null = null;

function read(): DockPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable */
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULTS;
  try {
    if (raw) value = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DockPrefs>) };
  } catch {
    /* ignore broken value */
  }
  cache = { raw, value };
  return value;
}

export function setDockPrefs(patch: Partial<DockPrefs>) {
  const next = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    cache = { raw: JSON.stringify(next), value: next };
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

export const getDockPrefs = () => read();

export function useDockPrefs(): DockPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}

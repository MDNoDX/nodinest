"use client";
import { useSyncExternalStore } from "react";

/**
 * Per-device preferences of the media dock (this browser only): whether the
 * shortcut hints are shown, audio-only mode and where the user dragged it.
 */
export type DockPrefs = {
  showKeys: boolean;
  audioOnly: boolean;
  /** Top-left corner in px; null = default bottom-right corner. */
  pos: { x: number; y: number } | null;
};

const KEY = "nn:dock-prefs";
const EVENT = "nn:dock-prefs";
const DEFAULTS: DockPrefs = { showKeys: true, audioOnly: false, pos: null };

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

export function useDockPrefs(): DockPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}

/** "⌥" on Apple keyboards, "Alt+" elsewhere. */
export function useAltLabel() {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌥" : "Alt+"),
    () => "Alt+",
  );
}

export function useModLabel() {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl+"),
    () => "Ctrl+",
  );
}

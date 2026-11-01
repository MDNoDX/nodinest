"use client";
import { useSyncExternalStore } from "react";

const KEY = "nn:time-12h";
const EVENT = "nn:time-format";

const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export function setHour12(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

const listen = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};

/** 24 hours unless this device chose AM / PM in Settings. */
export const useHour12 = () => useSyncExternalStore(listen, read, () => false);

/** "17:30" as this device shows it. */
export function clockText(v: string, h12: boolean) {
  if (!h12) return v;
  const h = Number(v.slice(0, 2));
  return `${h % 12 || 12}:${v.slice(3, 5)} ${h >= 12 ? "PM" : "AM"}`;
}

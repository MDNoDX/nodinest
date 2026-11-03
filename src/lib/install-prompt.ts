"use client";
/** The browser's install offer kept by INSTALL_SCRIPT, for every page that offers it. */
import { useSyncExternalStore } from "react";

export type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type W = Window & { __nnInstall?: InstallPrompt | null; __nnInstalled?: boolean };

function subscribe(cb: () => void) {
  window.addEventListener("nn:install", cb);
  return () => window.removeEventListener("nn:install", cb);
}

/** The offer, while the browser has one (Chrome / Edge / Samsung on Android, Chrome on a computer). */
export function useInstallPrompt() {
  const prompt = useSyncExternalStore(
    subscribe,
    () => (window as W).__nnInstall ?? null,
    () => null,
  );
  const installed = useSyncExternalStore(
    subscribe,
    () => (window as W).__nnInstalled === true,
    () => false,
  );
  return { prompt, installed };
}

/** Shows the browser's own install dialog; true when the person said yes. */
export async function runInstall(p: InstallPrompt) {
  await p.prompt();
  const r = await p.userChoice.catch(() => ({ outcome: "dismissed" }));
  (window as W).__nnInstall = null;
  if (r.outcome === "accepted") (window as W).__nnInstalled = true;
  window.dispatchEvent(new Event("nn:install"));
  return r.outcome === "accepted";
}

/** Already opened as an installed app (no browser bar). */
export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  matchMedia("(display-mode: window-controls-overlay)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

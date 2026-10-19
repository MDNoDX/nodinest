"use client";
import { CloudOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";

/** Wipes this device's offline copies (called on sign-out). */
export async function clearOfflineData() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear" });
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("nn-")).map((k) => caches.delete(k)));
    for (const k of Object.keys(localStorage)) if (k.startsWith("nn:")) localStorage.removeItem(k);
    sessionStorage.removeItem("nn:dock");
  } catch {
    /* nothing cached */
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Registers the service worker (production only) and shows an offline strip. */
export function Pwa() {
  const t = useTranslations("offline");
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  if (online) return null;
  return (
    <div
      role="status"
      className="bg-warning fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:rounded-full"
    >
      <CloudOff className="size-4" /> {t("banner")}
    </div>
  );
}

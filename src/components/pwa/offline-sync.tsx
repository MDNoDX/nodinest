"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { offlineOn, syncOffline } from "@/lib/offline-sync";

/**
 * Signed-in pages: keeps this device's offline copy fresh (lib/offline-sync.ts)
 * a few seconds after the page settles, and brings the page up to date as soon
 * as the network is back (it may have come from the offline copy).
 */
export function OfflineSync() {
  const router = useRouter();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const start = setTimeout(() => {
      if (offlineOn()) void syncOffline();
    }, 8000);
    const back = () => {
      router.refresh();
      if (offlineOn()) setTimeout(() => void syncOffline(), 5000);
    };
    window.addEventListener("online", back);
    return () => {
      clearTimeout(start);
      window.removeEventListener("online", back);
    };
  }, [router]);
  return null;
}

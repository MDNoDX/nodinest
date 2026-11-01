"use client";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { savePlaceAction, savePlaceFromIpAction } from "@/app/actions/roznoma";

/**
 * Asks the browser for the place (its own "Allow" window). If that is not
 * possible, prayer times still work: the rough place comes from the network.
 */
export function useLocate(onDone?: () => void) {
  const t = useTranslations("roznoma");
  const [busy, setBusy] = useState(false);
  const rough = useCallback(async () => {
    const r = await savePlaceFromIpAction().catch(() => null);
    setBusy(false);
    if (r?.ok && r.data) {
      toast.success(t("placeRough"));
      onDone?.();
    } else toast(t("placeHelp"));
  }, [onDone, t]);
  const locate = useCallback(() => {
    setBusy(true);
    if (!navigator.geolocation) return void rough();
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const r = await savePlaceAction(p.coords.latitude, p.coords.longitude);
        setBusy(false);
        if (r.ok) {
          toast.success(t("placeSaved"));
          onDone?.();
        }
      },
      () => void rough(),
      { timeout: 15_000, maximumAge: 3_600_000 },
    );
  }, [onDone, rough, t]);
  return { locate, busy };
}

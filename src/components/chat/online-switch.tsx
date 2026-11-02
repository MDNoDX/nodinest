"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setShowOnlineAction } from "@/app/actions/dm";
import { errorToast } from "@/lib/error-toast";
import { cn } from "@/lib/cn";

/** Settings → privacy: "online / last seen" on or off. Off hides it both ways. */
export function OnlineSwitch({ initial }: { initial: boolean }) {
  const t = useTranslations("chat");
  const te = useTranslations("errors");
  const [on, setOn] = useState(initial);
  const flip = async () => {
    const next = !on;
    setOn(next);
    const r = await setShowOnlineAction(next).catch(() => null);
    if (!r?.ok) {
      setOn(!next);
      errorToast(te, r && !r.ok ? r : "INTERNAL");
    }
  };
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block font-medium">{t("showOnline")}</span>
        <span className="text-muted block text-xs">{t("showOnlineHint")}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => void flip()}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          on ? "bg-primary" : "bg-surface-2 ring-border ring-1",
        )}
      >
        <span
          className={cn(
            "bg-surface absolute top-0.5 left-0.5 size-5 rounded-full shadow transition-transform",
            on && "translate-x-5",
          )}
        />
      </button>
    </label>
  );
}

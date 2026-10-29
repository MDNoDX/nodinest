"use client";
import { Globe, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { setItemVisibilityAction } from "@/app/actions/social";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";

/**
 * On a library item: show it on my public profile, or keep it private. A
 * switch that flips at once (the server is told in the background; on an
 * error it flips back).
 */
export function VisibilityToggle({
  resourceId,
  initial,
  profilePublic,
}: {
  resourceId: string;
  initial: boolean;
  profilePublic: boolean;
}) {
  const t = useTranslations("social");
  const te = useTranslations("errors");
  const [pub, setPub] = useState(initial);
  // Only the last click counts when someone taps quickly several times.
  const seq = useRef(0);
  const flip = async () => {
    const next = !pub;
    setPub(next);
    const n = ++seq.current;
    const r = await setItemVisibilityAction(resourceId, next).catch(() => null);
    if (n !== seq.current) return;
    if (!r?.ok) {
      setPub(!next);
      errorToast(te, r && !r.ok ? r : "INTERNAL");
    } else if (next && !profilePublic) toast(t("profileIsPrivate"));
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pub}
      onClick={() => void flip()}
      title={pub && !profilePublic ? t("profileIsPrivate") : t(pub ? "publicHint" : "privateHint")}
      className={cn(
        "group relative inline-flex h-8 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs font-medium transition-colors duration-300",
        pub
          ? "border-[var(--c-emerald)]/40 bg-[var(--c-emerald)]/10 text-[var(--c-emerald)]"
          : "border-border text-muted hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "relative h-6 w-10 rounded-full transition-colors duration-300",
          pub ? "bg-[var(--c-emerald)]" : "bg-surface-2",
        )}
      >
        <span
          className={cn(
            "bg-surface absolute top-0.5 left-0.5 grid size-5 place-items-center rounded-full shadow transition-transform duration-300 ease-out",
            pub && "translate-x-4",
          )}
        >
          {pub ? (
            <Globe className="size-3 text-[var(--c-emerald)]" />
          ) : (
            <Lock className="text-muted size-3" />
          )}
        </span>
      </span>
      <span className="min-w-[3.5rem] text-left">{pub ? t("public") : t("private")}</span>
    </button>
  );
}

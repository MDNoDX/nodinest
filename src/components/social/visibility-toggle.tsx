"use client";
import { Globe, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setItemVisibilityAction } from "@/app/actions/social";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";

/** On a library item: show it on my public profile, or keep it private. */
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
  const [pub, setPub] = useState(initial);
  const { pending, exec } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        exec(() => setItemVisibilityAction(resourceId, !pub), { onSuccess: () => setPub(!pub) })
      }
      title={pub && !profilePublic ? t("profileIsPrivate") : t(pub ? "publicHint" : "privateHint")}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        pub ? "border-[var(--c-emerald)]/40 text-[var(--c-emerald)]" : "border-border text-muted",
      )}
    >
      {pub ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
      {pub ? t("public") : t("private")}
    </button>
  );
}

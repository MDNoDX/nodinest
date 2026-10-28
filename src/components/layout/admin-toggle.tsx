"use client";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { setAdminModeAction } from "@/app/actions/personal";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";

/** Superadmin-only switch: normal use ⇄ admin mode (cookie, server-checked). */
export function AdminToggle({ on }: { on: boolean }) {
  const t = useTranslations("nav");
  const { pending, exec } = useAction();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() => exec(() => setAdminModeAction(!on))}
      title={on ? t("adminOn") : t("adminOff")}
      aria-label={t("adminMode")}
      className={cn(
        "flex h-9 items-center gap-2 rounded-full border px-2.5 text-xs font-semibold transition-colors",
        on
          ? "border-[var(--c-rose)] bg-[color-mix(in_oklab,var(--c-rose)_14%,transparent)] text-[var(--c-rose)]"
          : "border-border text-muted hover:text-foreground",
      )}
    >
      <ShieldCheck className="size-4" />
      <span className="hidden sm:inline">{t("adminMode")}</span>
      <span
        aria-hidden
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          on ? "bg-[var(--c-rose)]" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-white shadow transition-all",
            on ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

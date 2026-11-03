"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { clearOfflineData } from "@/components/pwa/pwa";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/cn";

/** Signing out, at the foot of Settings (phones have no avatar menu). */
export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        await clearOfflineData();
        router.push("/login");
        router.refresh();
      }}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[var(--c-rose)] transition-colors hover:bg-[var(--c-rose)]/10 disabled:opacity-60",
        className,
      )}
    >
      <LogOut className="size-4" /> {t("signOut")}
    </button>
  );
}

"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { clearOfflineData } from "@/components/pwa/pwa";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/cn";

/** "Sign out?" — asked once more, since it also clears this device's offline copies. */
export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        title={t("signOutTitle")}
        description={t("signOutBody")}
        closeLabel={tc("close")}
      >
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await authClient.signOut();
              await clearOfflineData();
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut /> {t("signOut")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Signing out, at the foot of Settings. */
export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[var(--c-rose)] transition-colors hover:bg-[var(--c-rose)]/10",
          className,
        )}
      >
        <LogOut className="size-4" /> {t("signOut")}
      </button>
      <SignOutDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

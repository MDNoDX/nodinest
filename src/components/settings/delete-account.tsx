"use client";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAccountAction } from "@/app/actions/personal";
import { clearOfflineData } from "@/components/pwa/pwa";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

/** Settings → delete my account (typed confirmation; everything goes). */
export function DeleteAccount() {
  const t = useTranslations("settings.deleteAccount");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [pending, start] = useTransition();
  const ok = word.trim().toUpperCase() === "DELETE";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-danger">
          <Trash2 /> {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={t("body")} closeLabel={tc("close")}>
        <label className="mt-2 flex flex-col gap-1.5 text-sm">
          {t("typeIt")}
          <Input value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc("cancel")}
          </Button>
          <Button
            variant="danger"
            disabled={!ok}
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteAccountAction(word);
                if (!r.ok) {
                  toast.error(t("failed"));
                  return;
                }
                await authClient.signOut().catch(() => {});
                await clearOfflineData();
                window.location.replace("/login");
              })
            }
          >
            {t("confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

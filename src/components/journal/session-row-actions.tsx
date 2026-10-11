"use client";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteSessionAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useAction } from "@/lib/use-action";
import { ManualSessionForm } from "./manual-session-form";

export function SessionRowActions({
  session,
}: {
  session: {
    id: string;
    startedAt: string;
    endedAt: string;
    minutes: number;
    note: string | null;
    resource: { id: string; label: string } | null;
  };
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { exec } = useAction();
  return (
    <div className="flex gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("journal.editSession")}>
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent title={t("journal.editSession")} closeLabel={t("common.close")}>
          <ManualSessionForm session={session} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <ConfirmButton
        variant="ghost"
        size="icon-sm"
        aria-label={t("common.delete")}
        message={t("journal.deleteConfirm")}
        onConfirm={() =>
          exec(() => deleteSessionAction(session.id), { success: t("common.deleted") })
        }
      >
        <Trash2 />
      </ConfirmButton>
    </div>
  );
}

"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";

/**
 * Asks once more before something is done: the child is the button that opens
 * the question (its own look is kept), `onConfirm` runs on "yes".
 */
export function AskFirst({
  title,
  message,
  confirmLabel,
  onConfirm,
  children,
}: {
  title: string;
  message?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => unknown;
  children: React.ReactElement;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={title} description={message} closeLabel={t("close")}>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              void onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

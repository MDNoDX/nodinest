"use client";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "./button";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";

/** Button that asks for confirmation in an accessible dialog before running. */
export function ConfirmButton({
  message,
  confirmLabel,
  onConfirm,
  children,
  variant = "outline",
  size = "sm",
  danger = true,
  ...rest
}: Omit<ButtonProps, "onClick"> & {
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown> | unknown;
  danger?: boolean;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} {...rest}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("confirm")} closeLabel={t("close")}>
        <p className="text-muted text-sm">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={pending}
            onClick={() =>
              start(async () => {
                await onConfirm();
                setOpen(false);
              })
            }
          >
            {confirmLabel ?? t("confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

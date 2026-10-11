"use client";
import { Play } from "lucide-react";
import { startSessionAction } from "@/app/actions/personal";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";

export function StartSessionButton({
  resourceId = null,
  label,
  ...rest
}: { resourceId?: string | null; label: string } & Omit<ButtonProps, "onClick">) {
  const { pending, exec } = useAction();
  return (
    <Button {...rest} loading={pending} onClick={() => exec(() => startSessionAction(resourceId))}>
      <Play /> {label}
    </Button>
  );
}

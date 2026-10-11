"use client";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { restoreNoteAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";

export function NoteRowActions({ id }: { id: string }) {
  const t = useTranslations("notes");
  const { pending, exec } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() => exec(() => restoreNoteAction(id), { success: t("restored") })}
    >
      <RotateCcw /> {t("restore")}
    </Button>
  );
}

"use client";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteNoteAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";

export function NoteActions({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { exec } = useAction();
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href={`/notes/${id}/edit`}>
          <Pencil /> {t("common.edit")}
        </Link>
      </Button>
      <ConfirmButton
        message={t("notes.deleteConfirm")}
        onConfirm={() =>
          exec(() => deleteNoteAction(id), {
            success: t("notes.movedToTrash"),
            onSuccess: () => router.push("/notes"),
          })
        }
      >
        <Trash2 /> {t("common.delete")}
      </ConfirmButton>
    </div>
  );
}

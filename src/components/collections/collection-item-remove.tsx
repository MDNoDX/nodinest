"use client";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteCollectionAction, toggleCollectionItemAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";

export function RemoveItemButton({
  collectionId,
  target,
}: {
  collectionId: string;
  target: { resourceId?: string; noteId?: string };
}) {
  const t = useTranslations();
  const { pending, exec } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      loading={pending}
      aria-label={t("common.remove")}
      onClick={() =>
        exec(() => toggleCollectionItemAction(collectionId, target, false), {
          success: t("collections.removed"),
        })
      }
    >
      <X />
    </Button>
  );
}

export function DeleteCollectionButton({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { exec } = useAction();
  return (
    <ConfirmButton
      message={t("collections.deleteConfirm")}
      onConfirm={() =>
        exec(() => deleteCollectionAction(id), {
          success: t("common.deleted"),
          onSuccess: () => router.push("/collections"),
        })
      }
    >
      {t("common.delete")}
    </ConfirmButton>
  );
}

"use client";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  deleteCollectionAction,
  reorderCollectionAction,
  toggleCollectionItemAction,
} from "@/app/actions/personal";
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

/** Move a ranked item one place up or down; sends the full new order. */
export function RankMoveButtons({
  collectionId,
  order,
  index,
}: {
  collectionId: string;
  order: string[];
  index: number;
}) {
  const t = useTranslations();
  const { pending, exec } = useAction();
  const move = (dir: -1 | 1) => {
    const next = [...order];
    const j = index + dir;
    [next[index], next[j]] = [next[j], next[index]];
    exec(() => reorderCollectionAction(collectionId, next));
  };
  return (
    <span className="flex flex-col">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending || index === 0}
        aria-label={t("collections.moveUp")}
        onClick={() => move(-1)}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending || index === order.length - 1}
        aria-label={t("collections.moveDown")}
        onClick={() => move(1)}
      >
        <ChevronDown />
      </Button>
    </span>
  );
}

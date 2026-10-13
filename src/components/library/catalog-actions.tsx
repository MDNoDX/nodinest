"use client";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { archiveCatalogAction } from "@/app/actions/catalog";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";

/**
 * Edit / archive controls. `canEdit` = admin mode or the user created the
 * entry; otherwise "edit" opens the form in suggestion mode.
 */
export function CatalogActions({
  type,
  id,
  isAdmin,
  canEdit,
  archived,
}: {
  type: "person" | "resource";
  id: string;
  isAdmin: boolean;
  canEdit: boolean;
  archived: boolean;
}) {
  const t = useTranslations();
  const { exec } = useAction();
  const base = type === "person" ? "/people" : "/library";
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`${base}/${id}/edit`}>
          <Pencil /> {canEdit ? t("common.edit") : t("resource.suggestEdit")}
        </Link>
      </Button>
      {archived && (isAdmin || canEdit) ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            exec(() => archiveCatalogAction(type, id, false), { success: t("common.restore") })
          }
        >
          <ArchiveRestore /> {t("common.restore")}
        </Button>
      ) : (
        !archived &&
        canEdit && (
          <ConfirmButton
            variant="ghost"
            message={type === "person" ? t("person.archiveConfirm") : t("resource.archiveConfirm")}
            onConfirm={() =>
              exec(() => archiveCatalogAction(type, id, true), { success: t("common.archived") })
            }
          >
            <Archive /> {t("common.archive")}
          </ConfirmButton>
        )
      )}
    </div>
  );
}

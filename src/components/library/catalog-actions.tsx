"use client";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { archiveCatalogAction } from "@/app/actions/catalog";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";

export function CatalogActions({
  type,
  id,
  isAdmin,
  archived,
}: {
  type: "person" | "resource";
  id: string;
  isAdmin: boolean;
  archived: boolean;
}) {
  const t = useTranslations();
  const { exec } = useAction();
  const base = type === "person" ? "/people" : "/library";
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href={`${base}/${id}/edit`}>
          <Pencil /> {isAdmin ? t("common.edit") : t("resource.suggestEdit")}
        </Link>
      </Button>
      {archived && isAdmin ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exec(() => archiveCatalogAction(type, id, false), { success: t("common.restore") })
          }
        >
          <ArchiveRestore /> {t("common.restore")}
        </Button>
      ) : (
        !archived && (
          <ConfirmButton
            variant="ghost"
            message={type === "person" ? t("person.archiveConfirm") : t("resource.archiveConfirm")}
            onConfirm={() =>
              exec(() => archiveCatalogAction(type, id, true), {
                success: isAdmin ? t("common.archived") : t("resource.archiveRequested"),
              })
            }
          >
            <Archive /> {t("common.archive")}
          </ConfirmButton>
        )
      )}
    </div>
  );
}

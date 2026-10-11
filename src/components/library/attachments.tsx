"use client";
import { FileText, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { deleteFileAction } from "@/app/actions/files";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { fmtBytes } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import { useRouter } from "next/navigation";

export function Attachments({
  resourceId,
  files,
  enabled,
}: {
  resourceId: string;
  files: { id: string; originalName: string; sizeBytes: number }[];
  enabled: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { exec } = useAction();
  return (
    <div className="flex flex-col gap-3">
      {files.length === 0 && <p className="text-muted text-sm">{t("resource.noAttachments")}</p>}
      <ul className="flex flex-col gap-1.5">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-sm">
            <FileText className="text-muted size-4" />
            <a
              href={`/api/files/${f.id}`}
              className="min-w-0 flex-1 truncate hover:underline"
              rel="noopener"
            >
              {f.originalName}
            </a>
            <span className="text-muted text-xs">{fmtBytes(f.sizeBytes)}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${t("common.delete")} ${f.originalName}`}
              onClick={() => exec(() => deleteFileAction(f.id), { success: t("common.deleted") })}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <FileUpload
        purpose="attachment"
        enabled={enabled}
        resourceId={resourceId}
        label="PDF / EPUB"
        onUploaded={() => router.refresh()}
      />
    </div>
  );
}

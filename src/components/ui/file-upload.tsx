"use client";
/* eslint-disable @next/next/no-img-element */
import { Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { confirmUploadAction, createUploadAction } from "@/app/actions/files";
import { Button } from "./button";

const ACCEPT = {
  cover: "image/jpeg,image/png,image/webp,image/avif,image/gif",
  portrait: "image/jpeg,image/png,image/webp,image/avif,image/gif",
  attachment: "application/pdf,application/epub+zip",
};

/**
 * Direct-to-storage upload with progress: the server issues a short-lived
 * signed URL after validating type/size/quota, the browser PUTs the file,
 * then the server verifies the stored object before it is used.
 */
export function FileUpload({
  purpose,
  enabled,
  currentFileId,
  onUploaded,
  onRemoved,
  label,
  resourceId,
}: {
  purpose: "cover" | "portrait" | "attachment";
  enabled: boolean;
  currentFileId?: string | null;
  onUploaded: (fileId: string) => void;
  onRemoved?: () => void;
  label: string;
  resourceId?: string;
}) {
  const t = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  if (!enabled)
    return (
      <p className="bg-surface-2 text-muted rounded-lg px-3 py-2 text-xs">
        {t("upload.unavailable")}
      </p>
    );

  const upload = async (file: File) => {
    const created = await createUploadAction({
      purpose,
      filename: file.name,
      mime: file.type,
      size: file.size,
      resourceId: resourceId ?? null,
    });
    if (!created.ok) {
      toast.error(
        created.message === "file_too_large"
          ? t("upload.tooLarge", { max: purpose === "attachment" ? 10 : 5 })
          : created.message === "unsupported_file_type"
            ? t("upload.badType")
            : t(`errors.${created.code}`),
      );
      return;
    }
    setProgress(0);
    const ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", created.data.signedUrl);
      xhr.setRequestHeader("content-type", file.type);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) =>
        e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    setProgress(null);
    if (!ok) {
      toast.error(t("errors.STORAGE_UNAVAILABLE"));
      return;
    }
    const confirmed = await confirmUploadAction(created.data.fileId);
    if (!confirmed.ok) {
      toast.error(t(`errors.${confirmed.code}`));
      return;
    }
    toast.success(t("upload.done"));
    onUploaded(created.data.fileId);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {currentFileId && purpose !== "attachment" && (
        <img
          src={`/api/files/${currentFileId}`}
          alt=""
          className="border-border h-16 w-12 rounded border object-cover"
        />
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT[purpose]}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => input.current?.click()}
        disabled={progress !== null}
      >
        <Upload />{" "}
        {progress !== null
          ? t("upload.uploading", { percent: progress })
          : currentFileId
            ? t("upload.replace")
            : `${t("upload.choose")} — ${label}`}
      </Button>
      {progress !== null && (
        <div
          className="bg-surface-2 h-1.5 w-32 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        >
          <div className="bg-primary h-full transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {currentFileId && onRemoved && (
        <Button type="button" variant="ghost" size="sm" onClick={onRemoved}>
          <X /> {t("upload.remove")}
        </Button>
      )}
    </div>
  );
}

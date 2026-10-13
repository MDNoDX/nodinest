"use client";
import { upload } from "@vercel/blob/client";
import { ImagePlus, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { registerUploadAction } from "@/app/actions/files";
import { Button } from "./button";

const ACCEPT = {
  cover: "image/jpeg,image/png,image/webp,image/avif,image/gif",
  portrait: "image/jpeg,image/png,image/webp,image/avif,image/gif",
  attachment: "application/pdf,application/epub+zip",
};

/**
 * Direct-to-Blob upload with progress. The server issues a token only after
 * checking auth, type, size and the per-user path; afterwards it verifies the
 * stored object before the file can be used.
 */
export function FileUpload({
  purpose,
  enabled,
  currentFileId,
  onUploaded,
  onRemoved,
  label,
  resourceId,
  userId,
  variant = "button",
}: {
  purpose: "cover" | "portrait" | "attachment";
  enabled: boolean;
  currentFileId?: string | null;
  onUploaded: (fileId: string) => void;
  onRemoved?: () => void;
  label: string;
  resourceId?: string;
  userId: string;
  variant?: "button" | "tile";
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

  const doUpload = async (file: File) => {
    setProgress(0);
    try {
      const safeName =
        file.name
          .normalize("NFKD")
          .replace(/[^\w.\-]+/g, "_")
          .slice(-80) || "file";
      const blob = await upload(`u/${userId}/${purpose}/${safeName}`, file, {
        access: "private",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify({ purpose, size: file.size, mime: file.type }),
        contentType: file.type,
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      const r = await registerUploadAction({
        pathname: blob.pathname,
        purpose,
        originalName: file.name,
        resourceId: resourceId ?? null,
      });
      if (!r.ok) {
        toast.error(t(`errors.${r.code}`));
        return;
      }
      toast.success(t("upload.done"));
      onUploaded(r.data.fileId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        /too large|maximum/i.test(msg)
          ? t("upload.tooLarge", { max: purpose === "attachment" ? 50 : 8 })
          : /content type/i.test(msg)
            ? t("upload.badType")
            : t("errors.STORAGE_UNAVAILABLE"),
      );
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT[purpose]}
      className="sr-only"
      aria-label={label}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void doUpload(f);
      }}
    />
  );

  if (variant === "tile")
    return (
      <div className="flex flex-col gap-2">
        {picker}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={progress !== null}
          className="border-border-strong text-muted hover:border-primary hover:text-primary flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-xs font-medium transition-colors"
        >
          <ImagePlus className="size-6" />
          {progress !== null ? t("upload.uploading", { percent: progress }) : label}
        </button>
      </div>
    );

  return (
    <div className="flex flex-wrap items-center gap-3">
      {picker}
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
            : label}
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

"use client";
import { upload } from "@vercel/blob/client";
import { FileUp, ImagePlus, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { registerUploadAction } from "@/app/actions/files";
import { cn } from "@/lib/cn";
import { Button } from "./button";

const ACCEPT = {
  cover: "image/jpeg,image/png,image/webp,image/avif,image/gif",
  portrait: "image/jpeg,image/png,image/webp,image/avif,image/gif",
  attachment: "application/pdf,application/epub+zip",
};

/**
 * A picture from a phone is many MB; a cover needs ~1000 px. WebP (JPEG where
 * the browser cannot make it) is a tenth of the size, so it goes up in a moment.
 */
async function smaller(file: File, max = 1000) {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 150_000)
    return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    const as = (type: string, q: number) =>
      new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));
    let blob = await as("image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") blob = await as("image/jpeg", 0.84);
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `image.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

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
  shape = "portrait",
}: {
  purpose: "cover" | "portrait" | "attachment";
  enabled: boolean;
  currentFileId?: string | null;
  onUploaded: (fileId: string) => void;
  onRemoved?: () => void;
  label: string;
  resourceId?: string;
  userId: string;
  /** "drop" is a wide zone a file can be dragged onto. */
  variant?: "button" | "tile" | "drop";
  /** The tile's shape: a book cover, or a video / podcast picture (16:9). */
  shape?: "portrait" | "landscape";
}) {
  const t = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  // The picture shows at once while it goes up; ✕ stops it.
  const [preview, setPreview] = useState<string | null>(null);
  const stopper = useRef<AbortController | null>(null);
  const stop = () => {
    stopper.current?.abort();
  };

  if (!enabled)
    return (
      <p className="bg-surface-2 text-muted rounded-lg px-3 py-2 text-xs">
        {t("upload.unavailable")}
      </p>
    );

  const doUpload = async (picked: File) => {
    setProgress(0);
    const ctl = new AbortController();
    stopper.current = ctl;
    if (picked.type.startsWith("image/")) setPreview(URL.createObjectURL(picked));
    try {
      const file = purpose === "attachment" ? picked : await smaller(picked);
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
        abortSignal: ctl.signal,
      });
      if (ctl.signal.aborted) return;
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
      if (ctl.signal.aborted) return;
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
      setPreview((p) => {
        if (p) URL.revokeObjectURL(p);
        return null;
      });
      stopper.current = null;
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

  if (variant === "drop")
    return (
      <div>
        {picker}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={progress !== null}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void doUpload(f);
          }}
          className={cn(
            "group flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
            over
              ? "border-primary bg-primary-soft"
              : "border-border-strong hover:border-primary hover:bg-surface-2",
          )}
        >
          <span className="bg-primary-soft text-primary grid size-12 place-items-center rounded-2xl transition-transform group-hover:-translate-y-0.5">
            <FileUp className="size-6" />
          </span>
          <span className="text-sm font-semibold">
            {progress !== null ? t("upload.uploading", { percent: progress }) : label}
          </span>
          <span className="text-muted text-xs">{t("upload.dropHint", { max: 50 })}</span>
          {progress !== null && (
            <span
              className="bg-surface-2 mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={label}
            >
              <span
                className="bg-primary block h-full transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </span>
          )}
        </button>
      </div>
    );

  if (variant === "tile")
    return (
      <div className="flex flex-col gap-2">
        {picker}
        {preview && progress !== null ? (
          <div
            className={cn(
              "border-border relative w-full overflow-hidden rounded-xl border",
              shape === "landscape" ? "aspect-video" : "aspect-[2/3]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="size-full object-cover opacity-70" />
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
                <span
                  className="block h-full rounded-full bg-white transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="tabular-nums">{progress}%</span>
              <button
                type="button"
                onClick={stop}
                aria-label={t("upload.cancel")}
                className="grid size-6 place-items-center rounded-full hover:bg-white/20"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={progress !== null}
            className={cn(
              "border-border-strong text-muted hover:border-primary hover:text-primary flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-xs font-medium transition-colors",
              shape === "landscape" ? "aspect-video" : "aspect-[2/3]",
            )}
          >
            <ImagePlus className="size-6" />
            {progress !== null ? t("upload.uploading", { percent: progress }) : label}
          </button>
        )}
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

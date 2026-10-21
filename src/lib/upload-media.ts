"use client";
import { upload } from "@vercel/blob/client";
import { registerUploadAction } from "@/app/actions/files";

export type UploadedMedia = { fileId: string; name: string; mime: string; size: number };

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  webm: "audio/webm",
  aac: "audio/aac",
  flac: "audio/flac",
  mov: "video/quicktime",
  m4v: "video/mp4",
};

/** "audio/webm;codecs=opus" → "audio/webm"; empty types guessed from the extension. */
export function baseMime(type: string, name = ""): string {
  const t = type.split(";")[0].trim().toLowerCase();
  if (t) return t === "audio/x-m4a" || t === "audio/m4a" ? "audio/mp4" : t;
  return EXT_MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Uploads an image / PDF / audio / video (purpose "media") straight to Blob and registers it. */
export async function uploadMedia(
  input: File | Blob,
  opts: {
    userId: string;
    name?: string;
    resourceId?: string | null;
    onProgress?: (pct: number) => void;
  },
): Promise<UploadedMedia> {
  const name = opts.name ?? (input instanceof File ? input.name : "recording");
  const mime = baseMime(input.type, name);
  const file = new File([input], name, { type: mime });
  const safe =
    name
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .slice(-80) || "file";
  const blob = await upload(`u/${opts.userId}/media/${Date.now()}-${safe}`, file, {
    access: "private",
    handleUploadUrl: "/api/blob/upload",
    clientPayload: JSON.stringify({ purpose: "media", size: file.size, mime }),
    contentType: mime,
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: (e) => opts.onProgress?.(Math.round(e.percentage)),
  });
  const r = await registerUploadAction({
    pathname: blob.pathname,
    purpose: "media",
    originalName: name,
    resourceId: opts.resourceId ?? null,
  });
  if (!r.ok) throw new Error(r.code);
  return { fileId: r.data.fileId, name, mime, size: file.size };
}

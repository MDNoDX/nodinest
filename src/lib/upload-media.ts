"use client";
import { uploadToStore } from "@/lib/blob-upload";
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
  mp4: "video/mp4",
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

/** Uploads an image / PDF / audio / video (purpose "media") to our store and registers it. */
export async function uploadMedia(
  input: File | Blob,
  opts: {
    userId: string;
    name?: string;
    resourceId?: string | null;
    onProgress?: (pct: number) => void;
    /** Stops the upload (a "cancel" while a big video goes up). */
    signal?: AbortSignal;
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
  // Files go up in parts: a part that fails on a weak network is sent again,
  // not the whole video.
  const blob = await uploadToStore(`u/${opts.userId}/media/${Date.now()}-${safe}`, file, {
    purpose: "media",
    mime,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });
  if (opts.signal?.aborted) throw new DOMException("cancelled", "AbortError");
  const r = await registerUploadAction({
    pathname: blob.pathname,
    purpose: "media",
    originalName: name,
    resourceId: opts.resourceId ?? null,
  });
  if (!r.ok) throw new Error(r.code);
  return { fileId: r.data.fileId, name, mime, size: file.size };
}

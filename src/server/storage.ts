/**
 * File storage on Vercel Blob (PRIVATE store). Flow:
 *  1. Browser asks /api/blob/upload for a client token (auth + type/size/path
 *     checks happen in `authorizeUpload`), then uploads directly to Blob.
 *  2. Browser calls `registerUpload`; the server verifies the stored object
 *     (`head`) and records it in `files`.
 *  3. Reads go through /api/files/[id] (access check + streamed `get`).
 * Without BLOB_READ_WRITE_TOKEN uploads are disabled; URL fields still work.
 */
import "server-only";
import { del, get, head } from "@vercel/blob";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, withUser, type AppContext } from "@/db";
import { files } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "./rate-limit";

export type UploadPurpose = "cover" | "portrait" | "attachment" | "media";

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/heic",
];
const DOC_TYPES = ["application/pdf", "application/epub+zip"];
export const AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MEDIA_TYPES = [...IMAGE_TYPES, "application/pdf", ...AUDIO_TYPES, ...VIDEO_TYPES];
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MEDIA_MAX_BYTES = 30 * 1024 * 1024;
/** Videos in a taqriz / own book (they count toward the user's quota). */
export const VIDEO_MAX_BYTES = 150 * 1024 * 1024;
export const USER_QUOTA_BYTES = 900 * 1024 * 1024;

export function attachmentMaxBytes() {
  const mb = Number(process.env.UPLOAD_MAX_MB ?? 50);
  return Math.min(200, Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}

export function isStorageConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export function allowedTypes(purpose: UploadPurpose) {
  return purpose === "attachment" ? DOC_TYPES : purpose === "media" ? MEDIA_TYPES : IMAGE_TYPES;
}

export function maxBytes(purpose: UploadPurpose, mime = "") {
  if (purpose === "media" && VIDEO_TYPES.includes(mime)) return VIDEO_MAX_BYTES;
  return purpose === "attachment"
    ? attachmentMaxBytes()
    : purpose === "media"
      ? MEDIA_MAX_BYTES
      : IMAGE_MAX_BYTES;
}

/** Every user's uploads live under their own prefix. */
export function userPrefix(userId: string, purpose: UploadPurpose) {
  return `u/${userId}/${purpose}/`;
}

export function sanitizeFilename(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(-120);
  return base || "file";
}

export async function storageUsage(ctx: AppContext): Promise<number> {
  const [r] = await db.execute<{ total: number }>(
    sql`select coalesce(sum(size_bytes), 0)::bigint as total from nodinest.files where owner_id = ${ctx.userId} and deleted_at is null`,
  );
  return Number(r.total);
}

/** Called before issuing a client upload token. Throws on anything suspicious. */
export async function authorizeUpload(
  ctx: AppContext,
  pathname: string,
  payload: { purpose: UploadPurpose; size: number; mime: string },
) {
  if (!isStorageConfigured()) throw new AppError("STORAGE_UNAVAILABLE");
  if (!["cover", "portrait", "attachment", "media"].includes(payload.purpose))
    throw new AppError("VALIDATION", "bad_purpose");
  if (!pathname.startsWith(userPrefix(ctx.userId, payload.purpose)) || pathname.includes(".."))
    throw new AppError("FORBIDDEN");
  if (!allowedTypes(payload.purpose).includes(payload.mime))
    throw new AppError("VALIDATION", "unsupported_file_type");
  if (
    !Number.isInteger(payload.size) ||
    payload.size <= 0 ||
    payload.size > maxBytes(payload.purpose, payload.mime)
  )
    throw new AppError("VALIDATION", "file_too_large");
  await enforceRateLimit(db, `upload:${ctx.userId}`, 60, 3600);
  if ((await storageUsage(ctx)) + payload.size > USER_QUOTA_BYTES)
    throw new AppError("VALIDATION", "quota_exceeded");
  return {
    allowedContentTypes: allowedTypes(payload.purpose),
    maximumSizeInBytes: maxBytes(payload.purpose, payload.mime),
  };
}

/** Verifies the uploaded blob and records it. Returns the new file id. */
export async function registerUpload(
  ctx: AppContext,
  input: {
    pathname: string;
    purpose: UploadPurpose;
    originalName: string;
    resourceId?: string | null;
  },
) {
  if (!isStorageConfigured()) throw new AppError("STORAGE_UNAVAILABLE");
  if (!input.pathname.startsWith(userPrefix(ctx.userId, input.purpose)))
    throw new AppError("FORBIDDEN");
  let meta;
  try {
    meta = await head(input.pathname);
  } catch {
    throw new AppError("VALIDATION", "upload_missing");
  }
  if (
    !allowedTypes(input.purpose).includes(meta.contentType) ||
    meta.size > maxBytes(input.purpose, meta.contentType)
  ) {
    await del(input.pathname).catch(() => {});
    throw new AppError("VALIDATION", "upload_mismatch");
  }
  const [row] = await withUser(db, ctx, (tx) =>
    tx
      .insert(files)
      .values({
        ownerId: ctx.userId,
        bucket: "vercel-blob",
        path: input.pathname,
        originalName: sanitizeFilename(input.originalName),
        mimeType: meta.contentType,
        sizeBytes: meta.size,
        purpose: input.purpose,
        isCatalog: input.purpose === "cover" || input.purpose === "portrait",
        resourceId:
          input.purpose === "attachment" || input.purpose === "media"
            ? (input.resourceId ?? null)
            : null,
        uploadedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: files.id }),
  );
  if (!row) throw new AppError("CONFLICT");
  return { fileId: row.id, url: `/api/files/${row.id}` };
}

async function readableFile(ctx: AppContext, fileId: string) {
  const [f] = await withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), isNull(files.deletedAt))),
  );
  // RLS restricts rows; double-check in code.
  if (!f || !f.uploadedAt || (f.ownerId !== ctx.userId && !f.isCatalog)) return null;
  return f;
}

/** Streams a file the actor may read. */
export async function openFile(ctx: AppContext, fileId: string) {
  const f = await readableFile(ctx, fileId);
  if (!f) return null;
  const res = await get(f.path, { access: "private" });
  if (!res || !res.stream) return null;
  return {
    stream: res.stream,
    contentType: f.mimeType,
    name: f.originalName,
    size: f.sizeBytes,
    purpose: f.purpose,
  };
}

/** Full bytes of the actor's own file (used for PDF text extraction). */
export async function readFileBytes(
  ctx: AppContext,
  fileId: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const f = await readableFile(ctx, fileId);
  if (!f) return null;
  const res = await get(f.path, { access: "private" });
  if (!res?.stream) return null;
  const buf = await new Response(res.stream).arrayBuffer();
  return { bytes: new Uint8Array(buf), mime: f.mimeType };
}

export async function deleteFile(ctx: AppContext, fileId: string) {
  const [f] = await withUser(db, ctx, (tx) =>
    tx
      .update(files)
      .set({ deletedAt: new Date() })
      .where(and(eq(files.id, fileId), eq(files.ownerId, ctx.userId), isNull(files.deletedAt)))
      .returning(),
  );
  if (!f) throw new AppError("NOT_FOUND");
  await del(f.path).catch(() => {
    /* metadata already marked deleted */
  });
}

export async function listAttachments(ctx: AppContext, resourceId: string) {
  return withUser(db, ctx, (tx) =>
    tx
      .select({
        id: files.id,
        originalName: files.originalName,
        sizeBytes: files.sizeBytes,
        mimeType: files.mimeType,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(
        and(
          eq(files.ownerId, ctx.userId),
          eq(files.resourceId, resourceId),
          eq(files.purpose, "attachment"),
          isNull(files.deletedAt),
          sql`${files.uploadedAt} is not null`,
        ),
      ),
  );
}

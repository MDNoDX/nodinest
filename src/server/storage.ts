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
import { later } from "./later";
import { del, get, head, list } from "@vercel/blob";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, withUser, type AppContext } from "@/db";
import { files } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "./rate-limit";
import {
  MOVE_FROM_BYTES,
  deleteParts,
  moveToTelegram,
  partsSize,
  readParts,
  streamParts,
  tgStorageReady,
  type TgPart,
} from "./tg-storage";

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
const BLOB_QUOTA_BYTES = 900 * 1024 * 1024;
/** Per-user space: much more once big files live in Telegram. */
export const userQuotaBytes = () => (tgStorageReady() ? 5 * 1024 * 1024 * 1024 : BLOB_QUOTA_BYTES);

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
  // A whole book's PDF sent to the assistant: as big as a book attachment.
  if (purpose === "media" && mime === "application/pdf") return attachmentMaxBytes();
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

/** Daily: uploads that were never registered take no one's quota, so they go. */
export async function sweepOrphanBlobs() {
  if (!isStorageConfigured()) return 0;
  const before = Date.now() - 24 * 3600_000;
  let cursor: string | undefined;
  let gone = 0;
  do {
    const page = await list({ prefix: "u/", limit: 1000, cursor });
    cursor = page.cursor;
    const old = page.blobs.filter((b) => b.uploadedAt.getTime() < before);
    if (!old.length) continue;
    const known = await db
      .select({ path: files.path })
      .from(files)
      .where(
        inArray(
          files.path,
          old.map((b) => b.pathname),
        ),
      );
    const have = new Set(known.map((k) => k.path));
    const orphans = old.filter((b) => !have.has(b.pathname)).map((b) => b.url);
    if (orphans.length) await del(orphans);
    gone += orphans.length;
  } while (cursor);
  return gone;
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
  // The quota counts registered files; big uploads are limited before that.
  if (payload.size > 10 * 1024 * 1024)
    await enforceRateLimit(db, `upload-big:${ctx.userId}`, 20, 86_400);
  if ((await storageUsage(ctx)) + payload.size > userQuotaBytes())
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
  // Big files go on to the Telegram store (Blob stays small and free).
  if (meta.size > MOVE_FROM_BYTES && tgStorageReady()) later(() => moveToTelegram(row.id));
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

/** The cover of something its owner shows publicly: anyone who may see them may see it. */
async function publicCover(ctx: AppContext, fileId: string) {
  const seen = sql`(u.profile_public or exists(select 1 from nodinest.follows v
    where v.follower_id = ${ctx.userId} and v.followee_id = u.id))`;
  const [f] = await db.execute<{ id: string }>(sql`
    select f.id from nodinest.files f
    join nodinest.resources r on r.cover_file_id = f.id and r.deleted_at is null
    join nodinest.learning_records lr on lr.resource_id = r.id and lr.visibility = 'public'
    join nodinest."user" u on u.id = lr.user_id
    where f.id = ${fileId} and f.deleted_at is null and f.uploaded_at is not null and ${seen}
    union
    select f.id from nodinest.files f
    join nodinest.writeups w on w.user_id = f.owner_id and w.is_public
      and w.doc::text like ${`%${fileId}%`}
    join nodinest."user" u on u.id = w.user_id
    where f.id = ${fileId} and f.deleted_at is null and f.uploaded_at is not null and ${seen}
    union
    select f.id from nodinest.files f
    join nodinest.book_text_sources s on s.file_id = f.id
    join nodinest.learning_records lr on lr.user_id = s.user_id and lr.resource_id = s.resource_id
      and lr.visibility = 'public' and lr.text_public
    join nodinest."user" u on u.id = lr.user_id
    where f.id = ${fileId} and f.deleted_at is null and f.uploaded_at is not null and ${seen}
    union
    select f.id from nodinest.files f
    join nodinest.dm_messages m on m.deleted_at is null
      and (m.file_id = f.id or m.resource_id in
        (select r.id from nodinest.resources r where r.cover_file_id = f.id))
    join nodinest.dm_threads t on t.id = m.thread_id and ${ctx.userId} in (t.a_id, t.b_id)
    where f.id = ${fileId} and f.deleted_at is null and f.uploaded_at is not null
    limit 1`);
  if (!f) return null;
  const [row] = await db.select().from(files).where(eq(files.id, fileId));
  return row ?? null;
}

/**
 * Streams a file the actor may read. Files moved to Telegram can be read in
 * byte ranges (`range` = [start, end] inclusive), so video seeking works.
 */
/** The file row when the actor may read it: theirs, the catalog's, shown publicly, or sent to them. */
export async function fileFor(ctx: AppContext, fileId: string) {
  return (await readableFile(ctx, fileId)) ?? (await publicCover(ctx, fileId));
}

export async function openFile(ctx: AppContext, fileId: string, range?: [number, number?]) {
  const f = await fileFor(ctx, fileId);
  if (!f) return null;
  const base = {
    contentType: f.mimeType,
    name: f.originalName,
    size: f.sizeBytes,
    purpose: f.purpose,
  };
  if (f.bucket === "telegram" && Array.isArray(f.tgParts)) {
    const parts = f.tgParts as TgPart[];
    const size = partsSize(parts);
    if (range) {
      const start = Math.min(range[0], size - 1);
      const end = Math.min(range[1] ?? size - 1, size - 1);
      return { ...base, size, stream: streamParts(parts, start, end), range: { start, end, size } };
    }
    return { ...base, size, stream: streamParts(parts) };
  }
  // Audio and video are read in byte ranges (Safari plays nothing without them,
  // and seeking needs them everywhere).
  const media = /^(audio|video)\//.test(f.mimeType);
  const res = await get(f.path, {
    access: "private",
    ...(media && range ? { headers: { range: `bytes=${range[0]}-${range[1] ?? ""}` } } : {}),
  });
  if (!res || !res.stream) return null;
  if (!media) return { ...base, stream: res.stream };
  const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(res.headers.get("content-range") ?? "");
  if (range && m)
    return {
      ...base,
      size: Number(m[3]),
      stream: res.stream,
      range: { start: Number(m[1]), end: Number(m[2]), size: Number(m[3]) },
    };
  return { ...base, stream: res.stream, range: null };
}

/** Full bytes of the actor's own file (used for PDF text extraction). */
export async function readFileBytes(
  ctx: AppContext,
  fileId: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const f = await readableFile(ctx, fileId);
  if (!f) return null;
  if (f.bucket === "telegram" && Array.isArray(f.tgParts))
    return { bytes: await readParts(f.tgParts as TgPart[]), mime: f.mimeType };
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
  if (f.bucket === "telegram" && Array.isArray(f.tgParts)) await deleteParts(f.tgParts as TgPart[]);
  else
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

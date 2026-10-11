/**
 * File storage on Supabase Storage (private bucket). The browser uploads
 * directly to a short-lived signed upload URL; downloads go through
 * /api/files/[id], which checks access and redirects to a 5-minute signed URL.
 * Without SUPABASE_* env vars, uploads are disabled and the UI falls back to
 * external URLs.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, withUser, type AppContext } from "@/db";
import { files } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "./rate-limit";

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};
const DOC_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
};
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const USER_QUOTA_BYTES = 200 * 1024 * 1024;

export function attachmentMaxBytes() {
  const mb = Number(process.env.UPLOAD_MAX_MB ?? 10);
  return Math.min(50, Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
}

export function isStorageConfigured() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

let client: SupabaseClient | null = null;
function storage() {
  if (!isStorageConfigured()) throw new AppError("STORAGE_UNAVAILABLE");
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.storage.from(process.env.SUPABASE_STORAGE_BUCKET || "nodinest-files");
}

export function sanitizeFilename(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(-120);
  return base || "file";
}

export function validateUpload(
  purpose: "cover" | "portrait" | "attachment",
  mime: string,
  size: number,
) {
  const table = purpose === "attachment" ? DOC_TYPES : IMAGE_TYPES;
  const ext = table[mime];
  if (!ext) throw new AppError("VALIDATION", "unsupported_file_type");
  const max = purpose === "attachment" ? attachmentMaxBytes() : IMAGE_MAX_BYTES;
  if (!Number.isInteger(size) || size <= 0 || size > max)
    throw new AppError("VALIDATION", "file_too_large", { max });
  return ext;
}

export async function storageUsage(ctx: AppContext): Promise<number> {
  const [r] = await db.execute<{ total: number }>(
    sql`select coalesce(sum(size_bytes), 0)::bigint as total from nodinest.files where owner_id = ${ctx.userId} and deleted_at is null`,
  );
  return Number(r.total);
}

export async function createUpload(
  ctx: AppContext,
  input: {
    purpose: "cover" | "portrait" | "attachment";
    filename: string;
    mime: string;
    size: number;
    resourceId?: string | null;
  },
) {
  const ext = validateUpload(input.purpose, input.mime, input.size);
  await enforceRateLimit(db, `upload:${ctx.userId}`, 30, 3600);
  if ((await storageUsage(ctx)) + input.size > USER_QUOTA_BYTES)
    throw new AppError("VALIDATION", "quota_exceeded");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "nodinest-files";
  const path = `${ctx.userId}/${input.purpose}/${randomUUID()}.${ext}`;
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error || !data) throw new AppError("STORAGE_UNAVAILABLE");
  const [row] = await withUser(db, ctx, (tx) =>
    tx
      .insert(files)
      .values({
        ownerId: ctx.userId,
        bucket,
        path,
        originalName: sanitizeFilename(input.filename),
        mimeType: input.mime,
        sizeBytes: input.size,
        purpose: input.purpose,
        isCatalog: input.purpose !== "attachment",
        resourceId: input.purpose === "attachment" ? (input.resourceId ?? null) : null,
      })
      .returning({ id: files.id }),
  );
  return { fileId: row.id, signedUrl: data.signedUrl, token: data.token, path };
}

/** Confirms the object exists and matches the declared size/type. */
export async function confirmUpload(ctx: AppContext, fileId: string) {
  const [f] = await withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.ownerId, ctx.userId), isNull(files.deletedAt))),
  );
  if (!f) throw new AppError("NOT_FOUND");
  const folder = f.path.split("/").slice(0, -1).join("/");
  const name = f.path.split("/").pop()!;
  const { data, error } = await storage().list(folder, { search: name, limit: 1 });
  const obj = data?.find((o) => o.name === name);
  if (error || !obj) throw new AppError("VALIDATION", "upload_missing");
  const size = Number((obj.metadata as { size?: number } | null)?.size ?? 0);
  const mime = String((obj.metadata as { mimetype?: string } | null)?.mimetype ?? "");
  const max = f.purpose === "attachment" ? attachmentMaxBytes() : IMAGE_MAX_BYTES;
  if (size <= 0 || size > max || (mime && mime !== f.mimeType)) {
    await storage().remove([f.path]);
    await withUser(db, ctx, (tx) =>
      tx.update(files).set({ deletedAt: new Date() }).where(eq(files.id, f.id)),
    );
    throw new AppError("VALIDATION", "upload_mismatch");
  }
  await withUser(db, ctx, (tx) =>
    tx.update(files).set({ uploadedAt: new Date(), sizeBytes: size }).where(eq(files.id, f.id)),
  );
  return { fileId: f.id, url: `/api/files/${f.id}` };
}

export async function signedDownloadUrl(ctx: AppContext, fileId: string): Promise<string | null> {
  const [f] = await withUser(db, ctx, (tx) =>
    tx
      .select({
        path: files.path,
        ownerId: files.ownerId,
        isCatalog: files.isCatalog,
        uploadedAt: files.uploadedAt,
        originalName: files.originalName,
        purpose: files.purpose,
      })
      .from(files)
      .where(and(eq(files.id, fileId), isNull(files.deletedAt))),
  );
  // RLS already restricts rows; double-check in code.
  if (!f || !f.uploadedAt || (f.ownerId !== ctx.userId && !f.isCatalog)) return null;
  const { data, error } = await storage().createSignedUrl(
    f.path,
    300,
    f.purpose === "attachment" ? { download: f.originalName } : undefined,
  );
  if (error || !data) return null;
  return data.signedUrl;
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
  try {
    await storage().remove([f.path]);
  } catch {
    /* metadata already marked deleted; object can be cleaned later */
  }
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

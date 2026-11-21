/**
 * What the daily backup (GitHub Actions in the private repo
 * MDNoDX/nodinest-backups, see docs/BACKUP.md) copies of the files: every
 * stored file of the `files` table, wherever it lives (Netlify Blobs or the
 * Telegram store), read in byte ranges small enough for one function answer.
 * Only the backup job may call this (CRON_SECRET), never a user.
 */
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { headFile, streamFile } from "./blob-store";
import { partsSize, streamParts, tgStorageReady, type TgPart } from "./tg-storage";

/** ≤ 4 MB per answer (Netlify streams ≤ 20 MB; small pieces retry cheaply). */
export const BACKUP_RANGE = 4 * 1024 * 1024;

export function backupAllowed(authorization: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(authorization ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function backupList() {
  const rows = await db
    .select({
      id: files.id,
      bucket: files.bucket,
      path: files.path,
      name: files.originalName,
      mime: files.mimeType,
      size: files.sizeBytes,
      ownerId: files.ownerId,
      tgParts: files.tgParts,
    })
    .from(files)
    .where(and(isNull(files.deletedAt), isNotNull(files.uploadedAt)))
    .orderBy(asc(files.createdAt));
  return rows.map(({ tgParts, ...r }) => ({
    ...r,
    size: r.bucket === "telegram" && Array.isArray(tgParts) ? partsSize(tgParts as TgPart[]) : r.size,
    readable: r.bucket !== "telegram" || tgStorageReady(),
  }));
}

/** Bytes [start, end] of one file, or null when it cannot be read now. */
export async function backupRange(id: string, start: number, end: number) {
  const [f] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), isNull(files.deletedAt), isNotNull(files.uploadedAt)));
  if (!f) return null;
  if (f.bucket === "telegram" && Array.isArray(f.tgParts)) {
    if (!tgStorageReady()) return null;
    const parts = f.tgParts as TgPart[];
    const size = partsSize(parts);
    const last = Math.min(end, size - 1);
    return { size, stream: streamParts(parts, start, last), start, end: last };
  }
  const m = await headFile(f.path);
  if (!m) return null;
  const last = Math.min(end, m.size - 1);
  return { size: m.size, stream: streamFile(f.path, m, start, last), start, end: last };
}

/**
 * Telegram as the file store (free, no size cap): big uploads (book PDFs,
 * audio, video) are moved from Vercel Blob to a private Telegram channel and
 * the Blob copy is deleted, so the 1 GB free Blob store never fills up.
 *
 *  • Files are split into ≤ 19 MB parts (a bot may download at most 20 MB per
 *    file) and every part is encrypted with AES-256-GCM (TG_FILES_KEY): the
 *    channel's members — the admin included — see only random bytes.
 *  • Reads stream the parts back in order; byte ranges fetch only the parts
 *    they need (video seeking).
 *  • The channel: TELEGRAM_STORAGE_CHAT_ID, else the admin channel (silent).
 */
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { get } from "@vercel/blob";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { tgRaw } from "./monitor/telegram";

export const PART = 19 * 1024 * 1024;
/** Smaller files (covers, portraits) stay in Blob: they are shown often and fast. */
export const MOVE_FROM_BYTES = 2 * 1024 * 1024;

export type TgPart = {
  /** Telegram file_id of the encrypted part. */
  f: string;
  /** Message id in the storage channel (for deleting). */
  m: number;
  /** Plain size in bytes. */
  n: number;
  /** IV and auth tag (base64). */
  iv: string;
  tag: string;
};

const chat = () => process.env.TELEGRAM_STORAGE_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID;
const key = () => {
  const k = process.env.TG_FILES_KEY;
  return k ? createHash("sha256").update(`nn-files:${k}`).digest() : null;
};

export const tgStorageReady = () => !!process.env.TELEGRAM_BOT_TOKEN && !!chat() && !!key();

function seal(plain: Uint8Array) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key()!, iv);
  const out = Buffer.concat([c.update(plain), c.final()]);
  return { data: out, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64") };
}

function open(data: Uint8Array, p: TgPart) {
  const d = createDecipheriv("aes-256-gcm", key()!, Buffer.from(p.iv, "base64"));
  d.setAuthTag(Buffer.from(p.tag, "base64"));
  return Buffer.concat([d.update(data), d.final()]);
}

export async function upload(fileId: string, i: number, total: number, plain: Uint8Array) {
  const s = seal(plain);
  for (let attempt = 0; attempt < 3; attempt++) {
    const form = new FormData();
    form.set("chat_id", chat()!);
    form.set("disable_notification", "true");
    form.set("caption", `#file ${fileId.slice(0, 8)} ${i + 1}/${total}`);
    form.set(
      "document",
      new Blob([s.data], { type: "application/octet-stream" }),
      `${fileId}.${i}.bin`,
    );
    const r = await tgRaw<{ message_id: number; document?: { file_id: string } }>(
      "sendDocument",
      form,
      false,
    );
    if (r?.document)
      return { f: r.document.file_id, m: r.message_id, n: plain.length, iv: s.iv, tag: s.tag };
    await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
  throw new Error("telegram upload failed");
}

const paths = new Map<string, { path: string; at: number }>();
/** Decrypted parts kept in memory (most recent last), up to ~120 MB per instance. */
const parts = new Map<string, Buffer>();
let cached = 0;
const CACHE_BYTES = 120 * 1024 * 1024;
const inflight = new Map<string, Promise<Buffer>>();

async function filePath(fileId: string) {
  const hit = paths.get(fileId);
  if (hit && Date.now() - hit.at < 50 * 60_000) return hit.path;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await tgRaw<{ file_path: string }>("getFile", { file_id: fileId });
    if (r?.file_path) {
      paths.set(fileId, { path: r.file_path, at: Date.now() });
      return r.file_path;
    }
    // Telegram limits bursts: wait a little and ask again.
    await new Promise((res) => setTimeout(res, 700 * (attempt + 1) ** 2));
  }
  throw new Error("telegram getFile failed");
}

async function fetchPart(p: TgPart): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(
        `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${await filePath(p.f)}`,
        { signal: AbortSignal.timeout(120_000) },
      );
      if (!res.ok) throw new Error(`telegram download ${res.status}`);
      return open(new Uint8Array(await res.arrayBuffer()), p);
    } catch (err) {
      paths.delete(p.f);
      if (attempt >= 2) throw err;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}

/** One decrypted part: from memory, a download already running, or Telegram. */
async function download(p: TgPart): Promise<Buffer> {
  const hit = parts.get(p.f);
  if (hit) {
    parts.delete(p.f);
    parts.set(p.f, hit);
    return hit;
  }
  let job = inflight.get(p.f);
  if (!job) {
    job = fetchPart(p).finally(() => inflight.delete(p.f));
    inflight.set(p.f, job);
  }
  const buf = await job;
  if (!parts.has(p.f)) {
    parts.set(p.f, buf);
    cached += buf.length;
    for (const [k, v] of parts) {
      if (cached <= CACHE_BYTES) break;
      parts.delete(k);
      cached -= v.length;
    }
  }
  return buf;
}

/** Moves one Blob file to Telegram and deletes the Blob copy. */
export async function moveToTelegram(fileId: string) {
  if (!tgStorageReady()) return false;
  const [f] = await db.select().from(files).where(eq(files.id, fileId));
  if (!f || f.deletedAt || f.bucket !== "vercel-blob" || !f.uploadedAt) return false;
  const res = await get(f.path, { access: "private" });
  if (!res?.stream) return false;
  const reader = res.stream.getReader();
  const total = Math.max(1, Math.ceil(f.sizeBytes / PART));
  const parts: TgPart[] = [];
  // Chunks are collected and joined once per part (no quadratic copying).
  let chunks: Uint8Array[] = [];
  let have = 0;
  const cut = async (n: number) => {
    const all = Buffer.concat(chunks, have);
    parts.push(await upload(f.id, parts.length, total, all.subarray(0, n)));
    const rest = all.subarray(n);
    chunks = rest.length ? [rest] : [];
    have = rest.length;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      chunks.push(value);
      have += value.length;
      while (have >= PART) await cut(PART);
    }
    if (done) break;
  }
  if (have > 0) await cut(have);
  const moved = await db
    .update(files)
    .set({ bucket: "telegram", tgParts: parts })
    .where(and(eq(files.id, f.id), eq(files.bucket, "vercel-blob"), isNull(files.deletedAt)))
    .returning({ id: files.id });
  if (!moved.length) {
    await deleteParts(parts);
    return false;
  }
  const { del } = await import("@vercel/blob");
  await del(f.path).catch(() => {});
  return true;
}

/** Moves waiting big files (oldest first) within a time budget; returns how many. */
export async function moveWaiting(budgetMs = 200_000, limit = 20) {
  if (!tgStorageReady()) return 0;
  const until = Date.now() + budgetMs;
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        eq(files.bucket, "vercel-blob"),
        isNull(files.deletedAt),
        gt(files.sizeBytes, MOVE_FROM_BYTES),
        sql`${files.uploadedAt} is not null`,
      ),
    )
    .orderBy(files.createdAt)
    .limit(limit);
  let n = 0;
  for (const r of rows) {
    if (Date.now() > until) break;
    if (await moveToTelegram(r.id).catch(() => false)) n++;
  }
  return n;
}

export async function deleteParts(parts: TgPart[]) {
  for (const p of parts)
    await tgRaw("deleteMessage", { chat_id: chat(), message_id: p.m }).catch(() => null);
}

/** The whole file (server-side reads: PDF text, audiobook, AI). */
export async function readParts(parts: TgPart[]) {
  const out: Buffer[] = [];
  for (const p of parts) out.push(await download(p));
  return new Uint8Array(Buffer.concat(out));
}

/**
 * Bytes [start, end] (inclusive) as a stream: only the parts in the range are
 * downloaded, one after another.
 */
export function streamParts(parts: TgPart[], start = 0, end?: number) {
  const size = parts.reduce((s, p) => s + p.n, 0);
  const last = Math.min(end ?? size - 1, size - 1);
  let i = 0;
  let base = 0;
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      while (i < parts.length && base + parts[i].n <= start) base += parts[i++].n;
      if (i >= parts.length || base > last) return ctrl.close();
      const p = parts[i];
      const data = await download(p);
      const from = Math.max(0, start - base);
      const to = Math.min(p.n, last - base + 1);
      ctrl.enqueue(new Uint8Array(data.subarray(from, to)));
      base += p.n;
      i++;
    },
  });
}

export const partsSize = (parts: TgPart[]) => parts.reduce((s, p) => s + p.n, 0);

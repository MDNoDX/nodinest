/**
 * The file store: Netlify Blobs (store "files"), with a folder on disk when the
 * app runs outside Netlify (local dev, tests). A file is kept in PARTS of
 * ≤ PART_BYTES plus a small manifest under its own path:
 *   `<path>`          → JSON { size, contentType, parts: [bytes…], uploadedAt }
 *   `<path>~p<index>` → the bytes of one part
 * Parts let the browser upload big files through a function (Netlify takes
 * ≤ 6 MB per request, base64 included) and let reads serve byte ranges
 * (Blobs has no range reads of its own), so video seeking works.
 */
import "server-only";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** `files.bucket` of a file kept here (Vercel Blob's were moved in, 0055). */
export const BLOB_BUCKET = "blob";

/** 3 MB: ~4 MB once base64-encoded, under Netlify's 6 MB request limit. */
export const PART_BYTES = 3 * 1024 * 1024;

export type BlobManifest = {
  size: number;
  contentType: string;
  parts: number[];
  uploadedAt: string;
};

type Backend = {
  set(key: string, data: Uint8Array | string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  del(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
};

const partKey = (p: string, i: number) => `${p}~p${i}`;

/**
 * Production always uses Netlify Blobs (a missing context throws instead of
 * quietly writing to a function's throwaway disk). The disk store is for
 * development, tests, or NN_LOCAL_BLOBS=1 (e.g. `next start` on this Mac).
 */
function useNetlify() {
  if (process.env.NN_LOCAL_BLOBS === "1") return false;
  return (
    process.env.NODE_ENV === "production" ||
    !!process.env.NETLIFY_BLOBS_CONTEXT ||
    !!(process.env.NETLIFY_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN)
  );
}

let backend: Promise<Backend> | null = null;
function store(): Promise<Backend> {
  backend ??= (async (): Promise<Backend> => {
    if (useNetlify()) {
      const { getStore } = await import("@netlify/blobs");
      const explicit =
        process.env.NETLIFY_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN
          ? { siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN }
          : {};
      const s = getStore({ name: "files", consistency: "strong", ...explicit });
      return {
        set: async (k, d) => {
          await s.set(k, typeof d === "string" ? d : (d.slice().buffer as ArrayBuffer));
        },
        get: async (k) => {
          const b = await s.get(k, { type: "arrayBuffer" });
          return b ? new Uint8Array(b) : null;
        },
        del: (k) => s.delete(k),
        list: async (prefix) => {
          const keys: string[] = [];
          for await (const page of s.list({ prefix, paginate: true }))
            for (const b of page.blobs) keys.push(b.key);
          return keys;
        },
      };
    }
    // Outside Netlify: plain files under .blobs/ (gitignored). Keys are encoded
    // into one flat name each, so a key can never climb out of the folder.
    const dir = path.join(process.cwd(), ".blobs", "files");
    await mkdir(dir, { recursive: true });
    const file = (k: string) => path.join(dir, encodeURIComponent(k));
    return {
      set: (k, d) => writeFile(file(k), d),
      get: async (k) => {
        try {
          return new Uint8Array(await readFile(file(k)));
        } catch {
          return null;
        }
      },
      del: (k) => rm(file(k), { force: true }),
      list: async (prefix) =>
        (await readdir(dir)).map((n) => decodeURIComponent(n)).filter((k) => k.startsWith(prefix)),
    };
  })();
  return backend;
}

/** Uploads always work: Netlify in production, a folder on disk elsewhere. */
export function blobStoreReady() {
  return process.env.BLOBS_DISABLED !== "1";
}

export async function putPart(p: string, index: number, bytes: Uint8Array) {
  if (bytes.byteLength > PART_BYTES) throw new Error("part too large");
  await (await store()).set(partKey(p, index), bytes);
}

/** Writes the manifest once every part is there; returns it, or null when a part is missing. */
export async function finishParts(p: string, contentType: string): Promise<BlobManifest | null> {
  const s = await store();
  const keys = await s.list(`${p}~p`);
  const count = keys.length;
  if (!count) return null;
  const parts: number[] = [];
  for (let i = 0; i < count; i++) {
    const b = await s.get(partKey(p, i));
    if (!b) return null;
    parts.push(b.byteLength);
  }
  const m: BlobManifest = {
    size: parts.reduce((a, b) => a + b, 0),
    contentType,
    parts,
    uploadedAt: new Date().toISOString(),
  };
  await s.set(p, JSON.stringify(m));
  return m;
}

/** Stores a whole file at once (server-side writers, the migration). */
export async function putFile(p: string, bytes: Uint8Array, contentType: string) {
  const s = await store();
  const parts: number[] = [];
  for (let off = 0, i = 0; off < bytes.byteLength || i === 0; off += PART_BYTES, i++) {
    const chunk = bytes.subarray(off, Math.min(off + PART_BYTES, bytes.byteLength));
    await s.set(partKey(p, i), chunk);
    parts.push(chunk.byteLength);
  }
  const m: BlobManifest = {
    size: bytes.byteLength,
    contentType,
    parts,
    uploadedAt: new Date().toISOString(),
  };
  await s.set(p, JSON.stringify(m));
  return m;
}

export async function headFile(p: string): Promise<BlobManifest | null> {
  const raw = await (await store()).get(p);
  if (!raw) return null;
  try {
    const m = JSON.parse(new TextDecoder().decode(raw)) as BlobManifest;
    return Array.isArray(m.parts) ? m : null;
  } catch {
    return null;
  }
}

/** Bytes [start, end] (inclusive) of a stored file, read part by part as they are needed. */
export function streamFile(p: string, m: BlobManifest, start = 0, end = m.size - 1) {
  let i = 0;
  let base = 0;
  return new ReadableStream<Uint8Array>({
    async pull(ctl) {
      const s = await store();
      while (i < m.parts.length) {
        const len = m.parts[i];
        const from = base;
        const to = base + len - 1;
        const idx = i;
        i++;
        base += len;
        if (to < start) continue;
        if (from > end) break;
        const bytes = await s.get(partKey(p, idx));
        if (!bytes) {
          ctl.error(new Error("blob part missing"));
          return;
        }
        ctl.enqueue(bytes.subarray(Math.max(0, start - from), Math.min(len, end - from + 1)));
        return;
      }
      ctl.close();
    },
  });
}

export async function readWhole(p: string): Promise<Uint8Array | null> {
  const m = await headFile(p);
  if (!m) return null;
  return new Uint8Array(await new Response(streamFile(p, m)).arrayBuffer());
}

/** Removes a file: its manifest and every part (also parts of an upload never finished). */
export async function deleteBlob(p: string) {
  const s = await store();
  await s.del(p);
  for (const k of await s.list(`${p}~p`)) await s.del(k);
}

/** Paths of finished files and of upload parts under a prefix. */
export async function listBlobs(prefix: string) {
  const keys = await (await store()).list(prefix);
  const files = new Set<string>();
  const partsOf = new Set<string>();
  for (const k of keys) {
    const at = k.lastIndexOf("~p");
    if (at > 0 && /^\d+$/.test(k.slice(at + 2))) partsOf.add(k.slice(0, at));
    else files.add(k);
  }
  return { files: [...files], unfinished: [...partsOf].filter((p) => !files.has(p)) };
}

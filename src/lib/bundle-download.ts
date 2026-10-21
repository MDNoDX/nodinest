"use client";
import { strToU8, zipSync, type Zippable } from "fflate";

type Manifest = {
  name: string;
  kind: "zip" | "epub";
  text: { path: string; content: string; store?: boolean }[];
  media: { path: string; fileId: string; size: number }[];
  totalBytes: number;
};

export class BundleError extends Error {}

/**
 * Downloads a write-up / own book with all its audio, video and pictures:
 * the server sends the text files and the media list, the browser fetches the
 * media and packs a .zip (web book) or .epub. Media are stored uncompressed
 * (they are compressed already), so packing is quick.
 */
export async function downloadBundle(
  resourceId: string,
  kind: "zip" | "epub",
  onProgress: (pct: number) => void,
): Promise<string> {
  const res = await fetch(`/api/export/bundle/${resourceId}?kind=${kind}`);
  if (!res.ok) throw new BundleError((await res.json().catch(() => ({})))?.error ?? "failed");
  const m = (await res.json()) as Manifest;
  const files: Zippable = {};
  for (const f of m.text) files[f.path] = [strToU8(f.content), { level: f.store ? 0 : 6 }];
  const total = Math.max(1, m.totalBytes);
  let done = 0;
  for (const x of m.media) {
    const r = await fetch(`/api/files/${x.fileId}`);
    if (!r.ok || !r.body) continue;
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      done += value.byteLength;
      onProgress(Math.min(99, Math.round((done / total) * 100)));
    }
    const bytes = new Uint8Array(chunks.reduce((s, c) => s + c.byteLength, 0));
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
    files[x.path] = [bytes, { level: 0 }];
  }
  const out = zipSync(files);
  const blob = new Blob([out], {
    type: kind === "epub" ? "application/epub+zip" : "application/zip",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = m.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  onProgress(100);
  return m.name;
}

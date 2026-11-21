"use client";
/**
 * A whole file from /api/files in 2 MB pieces (Range requests), joined in the
 * browser. One long answer could outlive a function's 60 s on a slow
 * connection and arrive cut; pieces are small, each retried on its own.
 * Returns a Response (so it can go into the Cache API like a plain fetch).
 */
const PIECE = 2 * 1024 * 1024;

export async function fetchInPieces(url: string, signal?: AbortSignal): Promise<Response> {
  const parts: ArrayBuffer[] = [];
  let type = "application/octet-stream";
  let total = Infinity;
  for (let start = 0; start < total; ) {
    let r: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await fetch(url, { headers: { range: `bytes=${start}-${start + PIECE - 1}` }, signal }).catch(
        () => null,
      );
      if (r && (r.ok || r.status === 404 || r.status === 403)) break;
      await new Promise((res) => setTimeout(res, 800 * 2 ** attempt));
    }
    if (!r || !r.ok) throw new Error(String(r?.status ?? "network"));
    type = r.headers.get("content-type") ?? type;
    const buf = await r.arrayBuffer();
    // A server that ignores ranges sends the whole file at once.
    if (r.status === 200) return new Response(buf, { headers: { "content-type": type } });
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") ?? "");
    total = m ? Number(m[1]) : start + buf.byteLength;
    if (!buf.byteLength) break;
    parts.push(buf);
    start += buf.byteLength;
  }
  return new Response(new Blob(parts, { type }), {
    headers: { "content-type": type, "content-length": String(total) },
  });
}

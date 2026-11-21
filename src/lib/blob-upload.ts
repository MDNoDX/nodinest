"use client";
/**
 * Sends a file to our store in parts through /api/blob/upload (see that route):
 * one request asks for a ticket, then every part goes up with up to two at once,
 * each retried on a weak network; the last part goes alone, after the others,
 * and closes the file. Progress counts sent bytes; an AbortSignal stops it.
 */

export class UploadError extends Error {
  constructor(
    public code: string,
    public reason: string,
  ) {
    super(reason || code);
  }
}

async function failure(res: Response) {
  let code = `HTTP_${res.status}`;
  try {
    code = ((await res.json()) as { error?: string }).error ?? code;
  } catch {
    /* not JSON */
  }
  return new UploadError(code, res.headers.get("x-nn-reason") ?? "");
}

function sendPart(
  url: string,
  body: Blob,
  signal: AbortSignal | undefined,
  onBytes: (sent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let code = `HTTP_${xhr.status}`;
      try {
        code = (JSON.parse(xhr.responseText) as { error?: string }).error ?? code;
      } catch {
        /* not JSON */
      }
      reject(new UploadError(code, xhr.getResponseHeader("x-nn-reason") ?? ""));
    };
    xhr.onerror = () => reject(new UploadError("NETWORK", ""));
    xhr.onabort = () => reject(new DOMException("cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export async function uploadToStore(
  pathname: string,
  file: Blob,
  opts: {
    purpose: "cover" | "portrait" | "attachment" | "media";
    mime: string;
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  },
): Promise<{ pathname: string }> {
  const start = await fetch("/api/blob/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathname, purpose: opts.purpose, size: file.size, mime: opts.mime }),
    signal: opts.signal,
  });
  if (!start.ok) throw await failure(start);
  const t = (await start.json()) as { pathname: string; ticket: string; partBytes: number };
  const count = Math.max(1, Math.ceil(file.size / t.partBytes));
  const sent = new Array<number>(count).fill(0);
  const report = () =>
    opts.onProgress?.(
      Math.min(100, Math.round((sent.reduce((a, b) => a + b, 0) / Math.max(1, file.size)) * 100)),
    );

  const one = async (i: number) => {
    const body = file.slice(i * t.partBytes, Math.min(file.size, (i + 1) * t.partBytes));
    const url = `/api/blob/upload?ticket=${encodeURIComponent(t.ticket)}&i=${i}${i === count - 1 ? "&last=1" : ""}`;
    for (let attempt = 0; ; attempt++) {
      if (opts.signal?.aborted) throw new DOMException("cancelled", "AbortError");
      try {
        await sendPart(url, body, opts.signal, (n) => {
          sent[i] = n;
          report();
        });
        sent[i] = body.size;
        report();
        return;
      } catch (e) {
        const retry =
          e instanceof UploadError && (e.code === "NETWORK" || /^HTTP_5|INTERNAL/.test(e.code));
        if (!retry || attempt >= 3) throw e;
        sent[i] = 0;
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
      }
    }
  };

  // Every part but the last, two at a time; then the last one closes the file.
  let next = 0;
  const worker = async () => {
    while (next < count - 1) await one(next++);
  };
  await Promise.all([worker(), worker()]);
  await one(count - 1);
  return { pathname: t.pathname };
}

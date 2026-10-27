"use client";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// One open document per file for the whole visit (pages are drawn from it).
const docs = new Map<string, Promise<PDFDocumentProxy>>();

function openPdf(fileId: string) {
  let p = docs.get(fileId);
  if (!p) {
    p = Promise.all([
      import("pdfjs-dist"),
      // The file is fetched whole (our file route streams it; no range requests).
      fetch(`/api/files/${fileId}`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      }),
    ]).then(([pdfjs, data]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return pdfjs.getDocument({
        data: new Uint8Array(data),
        // JPEG 2000 / JBIG2 pictures (maps, plates) are decoded with these.
        wasmUrl: "/pdfjs/wasm/",
      }).promise;
    });
    p.catch(() => docs.delete(fileId));
    docs.set(fileId, p);
  }
  return p;
}

/**
 * A page of the book's own PDF, drawn as it is printed (maps, illustrations,
 * the cover) — only when it comes into view.
 */
export function PdfPage({
  fileId,
  page,
  alt,
  className,
}: {
  fileId: string;
  page: number;
  alt: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"wait" | "done" | "error">("wait");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    const io = new IntersectionObserver(
      async ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        try {
          const pdf = await openPdf(fileId);
          const p = await pdf.getPage(page);
          if (cancelled || !canvas.current) return;
          const width = el.clientWidth || 600;
          const base = p.getViewport({ scale: 1 });
          const scale = (width / base.width) * Math.min(2, window.devicePixelRatio || 1);
          const vp = p.getViewport({ scale });
          const c = canvas.current;
          c.width = Math.floor(vp.width);
          c.height = Math.floor(vp.height);
          const render = p.render({ canvas: c, viewport: vp });
          task = render;
          await render.promise;
          if (!cancelled) setState("done");
        } catch {
          if (!cancelled) setState("error");
        }
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      task?.cancel();
    };
  }, [fileId, page]);

  return (
    <div ref={box} className={cn("relative w-full", className)}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={alt}
        className={cn(
          "border-border mx-auto block h-auto w-full rounded-lg border bg-white shadow-sm",
          state !== "done" && "hidden",
        )}
      />
      {state === "wait" && (
        <div className="bg-surface-2 grid aspect-[3/4] w-full place-items-center rounded-lg">
          <Loader2 className="text-muted size-5 animate-spin" />
        </div>
      )}
      {state === "error" && (
        <a
          href={`/api/files/${fileId}#page=${page}`}
          target="_blank"
          rel="noopener"
          className="bg-surface-2 text-primary grid aspect-[3/4] w-full place-items-center rounded-lg text-sm underline"
        >
          {alt}
        </a>
      )}
    </div>
  );
}

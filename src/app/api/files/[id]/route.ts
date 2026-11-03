import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { isStorageConfigured, openFile } from "@/server/storage";

/** The small sizes a picture may be asked for (no other, so nothing can be abused). */
const SIZES = [160, 320, 480, 720];
import { apiError, apiUserOrGuest } from "../../_utils";

export const maxDuration = 300;

/** Access-checked streaming of a private file (Blob, or Telegram parts with Range). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Guests see public covers and pictures (fileFor() decides what is public).
    const { ctx } = await apiUserOrGuest();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success || !isStorageConfigured())
      return new NextResponse(null, { status: 404 });
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get("range") ?? "");
    const f = await openFile(
      ctx,
      id,
      m ? [Number(m[1]), m[2] ? Number(m[2]) : undefined] : undefined,
    );
    if (!f) return new NextResponse(null, { status: 404 });
    // ?w=480: a small copy of a picture for lists and cards (covers are many,
    // the originals heavy). Made on the fly, kept by the browser for a month.
    const w = Number(req.nextUrl.searchParams.get("w"));
    if (w && SIZES.includes(w) && /^image\/(jpeg|png|webp|avif)$/.test(f.contentType)) {
      const bytes = Buffer.from(await new Response(f.stream).arrayBuffer());
      try {
        // failOn "none": phones sometimes save a photo a little short; browsers
        // still show it, so the small copy is made from what is there too.
        const out = await sharp(bytes, { failOn: "none", limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: w, height: w * 2, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer();
        return new NextResponse(new Uint8Array(out), {
          headers: {
            "content-type": "image/webp",
            "content-length": String(out.length),
            "cache-control": "private, max-age=2592000, immutable",
            "x-content-type-options": "nosniff",
          },
        });
      } catch {
        // Not readable as a picture here: the original, as it is (never an empty cover).
        return new NextResponse(new Uint8Array(bytes), {
          headers: {
            "content-type": f.contentType,
            "content-length": String(bytes.length),
            "cache-control": "private, max-age=86400",
            "x-content-type-options": "nosniff",
          },
        });
      }
    }
    const headers: Record<string, string> = {
      "content-type": f.contentType,
      "cache-control":
        // Book PDFs: an hour in this browser (the reader opens them often).
        f.purpose === "attachment" ? "private, max-age=3600" : "private, max-age=86400, immutable",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "x-content-type-options": "nosniff",
    };
    if ("range" in f && f.range) {
      const { start, end, size } = f.range;
      headers["content-range"] = `bytes ${start}-${end}/${size}`;
      headers["content-length"] = String(end - start + 1);
      headers["accept-ranges"] = "bytes";
      return new NextResponse(f.stream, { status: 206, headers });
    }
    if (f.size) headers["content-length"] = String(f.size);
    if ("range" in f) headers["accept-ranges"] = "bytes";
    return new NextResponse(f.stream, { headers });
  } catch (err) {
    return apiError(err);
  }
}

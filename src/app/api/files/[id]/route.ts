import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isStorageConfigured, openFile } from "@/server/storage";
import { apiError, apiUser } from "../../_utils";

export const maxDuration = 300;

/** Access-checked streaming of a private file (Blob, or Telegram parts with Range). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx } = await apiUser();
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
    const headers: Record<string, string> = {
      "content-type": f.contentType,
      "cache-control":
        f.purpose === "attachment" ? "private, no-store" : "private, max-age=86400, immutable",
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

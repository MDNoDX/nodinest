import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isStorageConfigured, openFile } from "@/server/storage";
import { apiError, apiUser } from "../../_utils";

export const maxDuration = 60;

/** Access-checked streaming of a private Blob file. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx } = await apiUser();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success || !isStorageConfigured())
      return new NextResponse(null, { status: 404 });
    const f = await openFile(ctx, id);
    if (!f) return new NextResponse(null, { status: 404 });
    return new NextResponse(f.stream, {
      headers: {
        "content-type": f.contentType,
        "cache-control":
          f.purpose === "attachment" ? "private, no-store" : "private, max-age=86400, immutable",
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

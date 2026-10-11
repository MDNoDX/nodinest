import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isStorageConfigured, signedDownloadUrl } from "@/server/storage";
import { apiError, apiUser } from "../../_utils";

/** Access-checked file access: redirects to a 5-minute signed URL. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx } = await apiUser();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success || !isStorageConfigured())
      return new NextResponse(null, { status: 404 });
    const url = await signedDownloadUrl(ctx, id);
    if (!url) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "cache-control": "private, max-age=240" },
    });
  } catch (err) {
    return apiError(err);
  }
}

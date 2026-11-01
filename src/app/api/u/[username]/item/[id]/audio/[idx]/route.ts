import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { segmentAudio } from "@/server/audiobook";
import { publicExtras, publicItem } from "@/server/social";
import { apiError, apiUser } from "../../../../../../_utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** One voiced part of an audiobook its owner made public. Never starts the voice. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string; id: string; idx: string }> },
) {
  try {
    const { ctx } = await apiUser();
    const p = await params;
    const it = await publicItem(ctx, decodeURIComponent(p.username), p.id);
    if (!it) throw new AppError("NOT_FOUND");
    const extra = await publicExtras(it.ownerId, it.resourceId);
    if (!extra.parts) throw new AppError("NOT_FOUND");
    const idx = z.coerce.number().int().min(0).max(extra.parts).parse(p.idx);
    // Permission is settled above: from here on it reads as the owner.
    const owner = { userId: it.ownerId, role: "user" as const };
    const { mp3 } = await segmentAudio(owner, it.resourceId, idx, {
      cast: !!extra.cast,
      cachedOnly: true,
    });
    return new NextResponse(new Uint8Array(mp3), {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

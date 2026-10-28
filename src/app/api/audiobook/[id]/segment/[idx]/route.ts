import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, toCtx } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { segmentAudio } from "@/server/audiobook";
import { apiError } from "../../../../_utils";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * MP3 of one audiobook segment: /api/audiobook/{resourceId}/segment/{idx}?v={rev}.{voiceRev}.
 * The URL changes with every analysis and voice change, so the browser may keep it forever.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  try {
    const u = await getCurrentUser();
    if (!u) throw new AppError("UNAUTHENTICATED");
    const p = await params;
    const id = z.string().uuid().parse(p.id);
    const idx = z.coerce.number().int().min(0).max(100_000).parse(p.idx);
    const { mp3, seconds, marks } = await segmentAudio(toCtx(u), id, idx);
    return new NextResponse(new Uint8Array(mp3), {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "private, max-age=31536000, immutable",
        "x-nn-seconds": seconds.toFixed(2),
        // When each script line starts (s); the player highlights by it.
        "x-nn-marks": marks.join(","),
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

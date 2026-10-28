import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, toCtx } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { previewVoice } from "@/server/audiobook";
import { apiError } from "../../../_utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** /api/audiobook/{id}/preview?voice=Leda&speaker=Name — a ~10 s sample (MP3). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await getCurrentUser();
    if (!u) throw new AppError("UNAUTHENTICATED");
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const voice = z.string().max(40).parse(req.nextUrl.searchParams.get("voice"));
    const speaker = z
      .string()
      .max(120)
      .parse(req.nextUrl.searchParams.get("speaker") ?? "narrator");
    const mp3 = await previewVoice(toCtx(u), id, voice, speaker);
    return new NextResponse(new Uint8Array(mp3), {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "private, max-age=604800",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

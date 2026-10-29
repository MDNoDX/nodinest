import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { voiceTurn } from "@/server/ai/voice";
import { apiError, apiUser, json } from "../../_utils";

export const runtime = "nodejs";
export const maxDuration = 120;

const body = z.object({
  /** The recording, base64 (≤ ~45 s of speech). */
  audio: z.string().min(16).max(3_000_000),
  mime: z.string().max(80),
  conversationId: z.string().uuid().nullish(),
  voice: z.enum(["female", "male"]).default("female"),
});

/** One turn of the live voice talk: { heard, reply, conversationId, audio (MP3 base64) | null }. */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { user, ctx } = await apiUser();
    const b = body.parse(await req.json());
    if (!/^audio\/[\w.+-]+/.test(b.mime)) throw new AppError("VALIDATION", "mime");
    const out = await voiceTurn(ctx, {
      audio: Buffer.from(b.audio, "base64"),
      mime: b.mime,
      conversationId: b.conversationId ?? null,
      locale: user.locale,
      timeZone: user.timezone,
      voice: b.voice,
    });
    return json(out);
  } catch (err) {
    return apiError(err);
  }
}

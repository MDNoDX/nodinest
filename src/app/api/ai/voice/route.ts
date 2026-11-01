import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, toActionError } from "@/lib/errors";
import { voiceGate, voiceTurn } from "@/server/ai/voice";
import { apiError, apiUser } from "../../_utils";

export const runtime = "nodejs";
export const maxDuration = 120;

const body = z.object({
  /** The recording, base64 (≤ ~45 s of speech). */
  audio: z.string().min(16).max(3_000_000),
  mime: z.string().max(80),
  conversationId: z.string().uuid().nullish(),
  voice: z.enum(["female", "male"]).default("female"),
});

/** One turn of the live voice talk, as a stream of VoiceEvent lines (server/ai/voice.ts). */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { user, ctx } = await apiUser();
    const b = body.parse(await req.json());
    if (!/^audio\/[\w.+-]+/.test(b.mime)) throw new AppError("VALIDATION", "mime");
    await voiceGate(ctx);
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(c) {
        const emit = (e: unknown) => {
          try {
            c.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
          } catch {
            /* the listener has gone */
          }
        };
        try {
          await voiceTurn(
            ctx,
            {
              audio: Buffer.from(b.audio, "base64"),
              mime: b.mime,
              conversationId: b.conversationId ?? null,
              locale: user.locale,
              timeZone: user.timezone,
              voice: b.voice,
            },
            emit,
            req.signal,
          );
        } catch (err) {
          emit({ t: "error", code: toActionError(err).code });
        } finally {
          try {
            c.close();
          } catch {
            /* already closed */
          }
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
    });
  } catch (err) {
    return apiError(err);
  }
}

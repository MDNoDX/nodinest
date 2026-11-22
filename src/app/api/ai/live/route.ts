import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { liveSession } from "@/server/ai/live";
import { apiError, apiUser, json } from "../../_utils";

export const runtime = "nodejs";

const body = z.object({
  conversationId: z.string().uuid().nullish(),
  voice: z.enum(["female", "male"]).default("female"),
});

/** A one-use token for a Gemini Live session (server/ai/live.ts). */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { user, ctx } = await apiUser();
    const b = body.parse(await req.json());
    return json(
      await liveSession(ctx, {
        conversationId: b.conversationId ?? null,
        locale: user.locale,
        timeZone: user.timezone,
        voice: b.voice,
      }),
    );
  } catch (err) {
    return apiError(err);
  }
}

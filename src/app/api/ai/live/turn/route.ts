import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { saveLiveTurn } from "@/server/ai/live";
import { apiError, apiUser, json } from "../../../_utils";

export const runtime = "nodejs";

const body = z.object({
  conversationId: z.string().uuid().nullish(),
  heard: z.string().max(8000),
  reply: z.string().max(16000),
});

/** Keeps one finished live turn in the conversation. */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { ctx } = await apiUser();
    const b = body.parse(await req.json());
    return json(
      await saveLiveTurn(ctx, {
        conversationId: b.conversationId ?? null,
        heard: b.heard,
        reply: b.reply,
      }),
    );
  } catch (err) {
    return apiError(err);
  }
}

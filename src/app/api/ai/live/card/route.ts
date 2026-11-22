import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { liveCard } from "@/server/ai/live";
import { apiError, apiUser, json } from "../../../_utils";

export const runtime = "nodejs";

/** A show_card call of the live model → the card to draw (the same checks as in the chat). */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { user, ctx } = await apiUser();
    const args: unknown = await req.json();
    return json({ card: await liveCard(ctx, args, user.locale, user.timezone) });
  } catch (err) {
    return apiError(err);
  }
}

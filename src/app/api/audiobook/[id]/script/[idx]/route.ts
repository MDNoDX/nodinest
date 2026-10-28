import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, toCtx } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { segmentPreview, segmentScript } from "@/server/audiobook";
import { apiError, json } from "../../../../_utils";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Who says what in one segment (shown while it plays). ?fast=1 answers at once. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  try {
    const u = await getCurrentUser();
    if (!u) throw new AppError("UNAUTHENTICATED");
    const p = await params;
    const id = z.string().uuid().parse(p.id);
    const idx = z.coerce.number().int().min(0).max(100_000).parse(p.idx);
    // ?fast=1: never waits for the AI (the book's own text until the script exists).
    if (req.nextUrl.searchParams.get("fast")) return json(await segmentPreview(toCtx(u), id, idx));
    const s = await segmentScript(toCtx(u), id, idx);
    return json({ lines: s.lines, page: s.page, draft: false });
  } catch (err) {
    return apiError(err);
  }
}

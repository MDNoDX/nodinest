import type { NextRequest } from "next/server";
import { z } from "zod";
import { segmentProgress } from "@/server/audiobook";
import { apiError, apiUser, json } from "../../../_utils";

/** How far the part being made is: /api/audiobook/{id}/progress?idx=N → { done, total } | null. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx } = await apiUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const idx = z.coerce
      .number()
      .int()
      .min(0)
      .max(100_000)
      .parse(req.nextUrl.searchParams.get("idx"));
    return json({ progress: await segmentProgress(ctx, id, idx) });
  } catch (err) {
    return apiError(err);
  }
}

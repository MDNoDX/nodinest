import type { NextRequest } from "next/server";
import { z } from "zod";
import { exportResponse, parseFormat } from "@/server/export/respond";
import { apiError, apiUser } from "../../../_utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** One write-up: /api/export/taqriz/{resourceId}?format=pdf|docx|md|txt&notes=1 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, ctx } = await apiUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const q = req.nextUrl.searchParams;
    return await exportResponse(user, ctx, {
      resourceIds: [id],
      format: parseFormat(q.get("format")),
      includeNotes: q.get("notes") === "1",
    });
  } catch (err) {
    return apiError(err);
  }
}

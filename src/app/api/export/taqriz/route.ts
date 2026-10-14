import type { NextRequest } from "next/server";
import { exportResponse, parseFormat } from "@/server/export/respond";
import { apiError, apiUser } from "../../_utils";

export const runtime = "nodejs";
export const maxDuration = 120;

/** All write-ups in one file (contents + one chapter per book). */
export async function GET(req: NextRequest) {
  try {
    const { user, ctx } = await apiUser();
    const q = req.nextUrl.searchParams;
    return await exportResponse(user, ctx, {
      format: parseFormat(q.get("format")),
      includeNotes: q.get("notes") === "1",
    });
  } catch (err) {
    return apiError(err);
  }
}

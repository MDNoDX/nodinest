import type { NextRequest } from "next/server";
import { deletedSince, messagesAround } from "@/server/dm";
import { apiError, apiUser, json } from "../../_utils";

/**
 * An open conversation asks here every few seconds (`after`) and when scrolled
 * up (`before`). A GET, so it never waits behind a server action being sent.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx } = await apiUser();
    const { id } = await params;
    const q = req.nextUrl.searchParams;
    const after = q.get("after") ?? undefined;
    const r = await messagesAround(ctx, id, {
      after,
      before: q.get("before") ?? undefined,
      reactedAt: q.get("rat") ?? undefined,
      pinnedAt: q.get("pat") ?? undefined,
    });
    const gone = after ? await deletedSince(ctx, id, after) : [];
    return json({ ...r, gone });
  } catch (err) {
    return apiError(err);
  }
}

import type { NextRequest } from "next/server";
import { z } from "zod";
import { readerPages } from "@/server/reader";
import { apiError, apiUser, json } from "../../../_utils";

export const runtime = "nodejs";

/** Book text for the reader: /api/book/{resourceId}/pages?from=N&to=M (≤ 15 pages). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx } = await apiUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const q = req.nextUrl.searchParams;
    const from = z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .parse(q.get("from") ?? "1");
    const to = z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .parse(q.get("to") ?? String(from + 7));
    return json({ pages: await readerPages(ctx, id, from, to) });
  } catch (err) {
    return apiError(err);
  }
}

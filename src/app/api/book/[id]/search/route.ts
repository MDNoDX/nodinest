import type { NextRequest } from "next/server";
import { z } from "zod";
import { lineKey } from "@/lib/reflow";
import { getStructure } from "@/server/book-structure";
import { searchBookText } from "@/server/booktext";
import { apiError, apiUser, json } from "../../../_utils";

export const runtime = "nodejs";

/** Search inside one book, in reading order: /api/book/{resourceId}/search?q=… */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx } = await apiUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const q = z
      .string()
      .trim()
      .min(2)
      .max(200)
      .parse(req.nextUrl.searchParams.get("q") ?? "");
    // Snippets without the book's running headers / navigation lines.
    const noise = new Set((await getStructure(ctx, id))?.noise ?? []);
    const r = await searchBookText(ctx, {
      query: q,
      resourceId: id,
      limit: 50,
      order: "page",
      clean: (c) =>
        c
          .split("\n")
          .filter((l) => !noise.has(lineKey(l)))
          .join("\n"),
    });
    return json({
      total: r.total,
      hits: r.hits.map((h) => ({ page: h.page, snippet: h.snippet })),
    });
  } catch (err) {
    return apiError(err);
  }
}

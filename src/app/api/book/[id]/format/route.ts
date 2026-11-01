import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { formatBook } from "@/server/book-format";
import { apiError, apiUser, json } from "../../../_utils";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The reader asks for the pages around it to be laid out. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { ctx } = await apiUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { page } = z
      .object({ page: z.number().int().min(1).max(100_000) })
      .parse(await req.json());
    return json({ done: await formatBook(ctx, id, { around: page }) });
  } catch (err) {
    return apiError(err);
  }
}

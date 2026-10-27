import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { saveReadingPage } from "@/server/reader";
import { apiError, apiUser, json } from "../../../_utils";

export const runtime = "nodejs";

/** The page the reader reached (fetch keepalive, same origin only). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { ctx } = await apiUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const body = (await req.json().catch(() => ({}))) as { page?: number; total?: number };
    await saveReadingPage(ctx, id, Number(body.page), Number(body.total));
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

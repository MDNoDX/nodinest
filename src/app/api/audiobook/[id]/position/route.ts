import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { savePosition } from "@/server/audiobook";
import { apiError, apiUser, json } from "../../../_utils";

export const runtime = "nodejs";

/** Where the listener is (fetch keepalive, same origin only). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { ctx } = await apiUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const body = (await req.json().catch(() => ({}))) as { idx?: number; sec?: number };
    await savePosition(ctx, id, Number(body.idx), Number(body.sec));
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

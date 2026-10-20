import type { NextRequest } from "next/server";
import { db } from "@/db";
import { AppError } from "@/lib/errors";
import { saveResume } from "@/server/resume";
import { apiError, apiUser, json } from "../_utils";

export const runtime = "nodejs";

/** Saves where the user stopped (fetch keepalive / sendBeacon, same origin only). */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { ctx } = await apiUser();
    const body = await req.json().catch(() => null);
    await saveResume(db, ctx, body);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

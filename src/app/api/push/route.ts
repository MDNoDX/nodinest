import type { NextRequest } from "next/server";
import { z } from "zod";
import { dropPush, pushKey, savePush } from "@/server/push";
import { apiError, apiUser, json } from "../_utils";

/** The public key (null until push is set up on the server). */
export async function GET() {
  try {
    await apiUser();
    return json({ key: pushKey() });
  } catch (err) {
    return apiError(err);
  }
}

/** This browser's Web Push address: POST to subscribe, DELETE to stop. */
export async function POST(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    await savePush(ctx, await req.json());
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(await req.json());
    await dropPush(ctx, endpoint);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

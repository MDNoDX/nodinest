import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, toCtx } from "@/lib/auth/session";
import { authorizeUpload } from "@/server/storage";
import { apiError } from "../../_utils";

const payloadSchema = z.object({
  purpose: z.enum(["cover", "portrait", "attachment", "media"]),
  size: z.number().int().positive(),
  mime: z.string().max(100),
});

/** Issues short-lived client-upload tokens after auth + type/size/path checks. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const u = await getCurrentUser();
        if (!u) throw new Error("UNAUTHENTICATED");
        const payload = payloadSchema.parse(JSON.parse(clientPayload ?? "{}"));
        const limits = await authorizeUpload(toCtx(u), pathname, payload);
        return { ...limits, addRandomSuffix: true, tokenPayload: JSON.stringify({ userId: u.id }) };
      },
      // Registration happens via the registerUpload server action (works locally too).
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    return apiError(err);
  }
}

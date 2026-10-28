import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { generateStream } from "@/server/ai/gemini";
import { prepareAsk, prepareWrite } from "@/server/ai/study";
import { apiError, apiUser } from "../../_utils";
import { asLocale } from "@/i18n/config";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Taqriz AI panel answers as a text stream (shown while the model writes).
 * Body: { kind: "ask" | "write", input }. Extra facts go in the x-nn-meta header.
 */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new AppError("FORBIDDEN");
    const { user, ctx } = await apiUser();
    const body = z
      .object({ kind: z.enum(["ask", "write"]), input: z.record(z.string(), z.unknown()) })
      .parse(await req.json());
    const locale = asLocale(user.locale);
    const full = { ...ctx, superadminAccount: user.isSuperadmin };
    const p =
      body.kind === "ask"
        ? await prepareAsk(full, { ...body.input, locale })
        : await prepareWrite(full, { ...body.input, locale });
    const gen = generateStream(p.contents, p.config, { timeoutMs: p.timeoutMs });
    // Pull the first piece before answering, so failures still return an error code.
    const first = await gen.next();
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (!first.done) controller.enqueue(enc.encode(first.value));
          for await (const piece of gen) controller.enqueue(enc.encode(piece));
        } catch {
          controller.enqueue(enc.encode("\n\n…"));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-nn-meta": encodeURIComponent(JSON.stringify(p.meta)),
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

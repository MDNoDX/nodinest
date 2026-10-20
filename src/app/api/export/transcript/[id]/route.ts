import type { NextRequest } from "next/server";
import { z } from "zod";
import { markdownToNodes, sanitizeDoc } from "@/lib/writeup-doc";
import { transcriptText } from "@/server/ai/transcripts";
import { exportResponse, parseFormat } from "@/server/export/respond";
import { labels } from "@/server/export/labels";
import { apiError, apiUser } from "../../../_utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A finished AI transcript / konspekt: /api/export/transcript/{id}?format=pdf|docx|md|txt */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, ctx } = await apiUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const tr = await transcriptText(ctx, id);
    const doc = sanitizeDoc({ type: "doc", content: markdownToNodes(tr.text) });
    return await exportResponse(user, ctx, {
      resourceIds: [tr.resourceId],
      format: parseFormat(req.nextUrl.searchParams.get("format")),
      includeNotes: false,
      override: async (loc) => ({
        doc,
        words: tr.text.split(/\s+/).filter(Boolean).length,
        docLabel: tr.mode === "notes" ? labels(loc).konspekt : labels(loc).transcript,
        status: null,
        rating: null,
        startedAt: null,
        completedAt: null,
        opinion: null,
        notes: [],
        images: {},
      }),
    });
  } catch (err) {
    return apiError(err);
  }
}

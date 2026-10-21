/**
 * Files the user gives the AI (chat attachments, taqriz audio): images, PDFs
 * and audio are passed to Gemini directly (inline, ≤ 18 MB per turn); bigger
 * PDFs are sent as their extracted text. Only the owner's files are readable.
 */
import "server-only";
import type { Part } from "@google/genai";
import { extractText } from "unpdf";
import { db, withUser, type AppContext } from "@/db";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "../rate-limit";
import { getAiSettings } from "../settings";
import { readFileBytes } from "../storage";
import { generate, isAiConfigured, uploadToGemini } from "./gemini";
import { files } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

export type AttachmentInfo = { fileId: string; name: string; mime: string; size: number };

const INLINE_LIMIT = 18 * 1024 * 1024;
const GEMINI_AUDIO: Record<string, string> = {
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
};

export async function describeFiles(ctx: AppContext, ids: string[]): Promise<AttachmentInfo[]> {
  if (!ids.length) return [];
  const rows = await withUser(db, ctx, (tx) =>
    tx
      .select({
        id: files.id,
        name: files.originalName,
        mime: files.mimeType,
        size: files.sizeBytes,
      })
      .from(files)
      .where(and(inArray(files.id, ids), eq(files.ownerId, ctx.userId), isNull(files.deletedAt))),
  );
  return ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ fileId: r.id, name: r.name, mime: r.mime, size: Number(r.size) }));
}

/** Gemini parts for this turn's attachments (+ a short text label for each). */
export async function attachmentParts(ctx: AppContext, list: AttachmentInfo[]): Promise<Part[]> {
  const parts: Part[] = [];
  let budget = INLINE_LIMIT;
  for (const a of list.slice(0, 6)) {
    const f = await readFileBytes(ctx, a.fileId);
    if (!f) continue;
    const mime = GEMINI_AUDIO[f.mime] ?? f.mime;
    parts.push({ text: `[Attached file: ${a.name} (${mime})]` });
    if (f.bytes.byteLength <= budget) {
      budget -= f.bytes.byteLength;
      parts.push({ inlineData: { mimeType: mime, data: Buffer.from(f.bytes).toString("base64") } });
    } else if (mime === "application/pdf") {
      const { text, totalPages } = await extractText(f.bytes, { mergePages: false });
      const body = text
        .slice(0, 80)
        .map((t, i) => `--- page ${i + 1} ---\n${t}`)
        .join("\n")
        .slice(0, 150_000);
      parts.push({
        text: `PDF text (${totalPages} pages, first ${Math.min(80, totalPages)}):\n${body}`,
      });
    } else {
      parts.push({ text: "(too large to read)" });
    }
  }
  return parts;
}

/** Speech → text in the language spoken, from audio or video (counts toward the AI limit). */
export async function transcribeAudio(ctx: AppContext, fileId: string): Promise<string> {
  if (!isAiConfigured()) throw new AppError("AI_UNAVAILABLE", "not_configured");
  const [info] = await describeFiles(ctx, [fileId]);
  if (!info || !/^(audio|video)\//.test(info.mime)) throw new AppError("NOT_FOUND");
  if (!ctx.superadminAccount) {
    const s = await getAiSettings(db);
    await enforceRateLimit(db, `ai:${ctx.userId}`, s.dailyLimitPerUser, 86_400);
  }
  const f = await readFileBytes(ctx, fileId);
  if (!f) throw new AppError("NOT_FOUND");
  const mimeType = GEMINI_AUDIO[f.mime] ?? f.mime;
  // Small recordings go inline; longer ones (videos) through the Files API.
  const media: Part =
    f.bytes.byteLength > INLINE_LIMIT
      ? { fileData: { mimeType, fileUri: await uploadToGemini(f.bytes, mimeType) } }
      : { inlineData: { mimeType, data: Buffer.from(f.bytes).toString("base64") } };
  const res = await generate(
    [
      {
        role: "user",
        parts: [
          media,
          {
            text: "Transcribe this recording verbatim in the language spoken (Uzbek Latin script for Uzbek). Add punctuation and paragraph breaks. Output only the transcript.",
          },
        ],
      },
    ],
    { temperature: 0 },
    { timeoutMs: 120_000 },
  );
  return (res.text ?? "").trim();
}

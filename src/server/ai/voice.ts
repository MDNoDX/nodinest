/**
 * Live voice talk: a short recording → what was said and in which language →
 * the companion's reply (the same conversation as the chat) → spoken in that
 * language (server/ai/speech.ts picks the voice). Premium; others can try it a
 * few times a day. If speech is not available, the reply still comes as text.
 */
import "server-only";
import { db, type AppContext } from "@/db";
import { aiLanguage, asLocale } from "@/i18n/config";
import { AppError } from "@/lib/errors";
import { limitsFor } from "../premium";
import { hitRateLimit } from "../rate-limit";
import { runAssistant } from "./assistant";
import { generate } from "./gemini";
import { talkSpeech } from "./speech";

/** Free accounts can try the live talk this many times a day. */
export const FREE_VOICE_TURNS = 3;

/** Text as it should be said: no markdown, list marks or links. */
const forSpeech = (s: string) =>
  s
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/^#+\s*/gm, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 1500);

export async function voiceTurn(
  ctx: AppContext,
  input: {
    audio: Uint8Array;
    mime: string;
    conversationId: string | null;
    locale: string;
    timeZone: string;
    voice: "female" | "male";
  },
) {
  if (!ctx.superadminAccount) {
    const plan = await limitsFor(ctx);
    if (!plan.premium) {
      const left = await hitRateLimit(db, `voice-free:${ctx.userId}`, FREE_VOICE_TURNS, 86_400);
      if (!left.allowed) throw new AppError("PREMIUM_REQUIRED", "voice");
    }
  }
  const loc = asLocale(input.locale);
  const mimeType = input.mime.split(";")[0] || "audio/webm";
  const heardRes = await generate(
    [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: Buffer.from(input.audio).toString("base64") } },
          {
            text: `Transcribe exactly what is said in this short recording (the user usually speaks ${aiLanguage(loc)}; Uzbek in Latin script). Answer in one line: the two-letter language code, then "|", then the words, e.g. "uz|Salom". If nothing is said or it is only noise, answer "-".`,
          },
        ],
      },
    ],
    { temperature: 0, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 512 } },
    { timeoutMs: 30_000 },
  );
  const raw = (heardRes.text ?? "").trim();
  const m = /^([a-z]{2})\|([\s\S]+)$/.exec(raw);
  const heard = (m ? m[2] : raw === "-" ? "" : raw).trim();
  const lang = m?.[1] ?? (loc === "uz-Cyrl" ? "uz" : loc);
  if (!heard) return { heard: "", reply: "", conversationId: input.conversationId, audio: null };

  const turn = await runAssistant(ctx, {
    conversationId: input.conversationId,
    message: heard,
    spoken: true,
    locale: input.locale,
    timeZone: input.timeZone,
  });
  const text = forSpeech(turn.reply);
  const mp3 = text ? await talkSpeech(ctx, text, lang, input.voice) : null;
  return {
    heard,
    reply: turn.reply,
    conversationId: turn.conversationId,
    audio: mp3 ? mp3.toString("base64") : null,
    visuals: turn.visuals,
  };
}

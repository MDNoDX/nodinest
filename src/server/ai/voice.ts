/**
 * Live voice talk ("Suhbat" by voice): what the user said (a short recording)
 * → text → the Suhbat reply (same conversation as the chat) → spoken with a
 * clear voice in the user's language. If speech is not available (quota), the
 * reply still comes back as text.
 */
import "server-only";
import type { AppContext } from "@/db";
import { aiLanguage, asLocale } from "@/i18n/config";
import { AppError } from "@/lib/errors";
import { encodeMp3 } from "../audiobook";
import { runAssistant } from "./assistant";
import { generate, speak } from "./gemini";

/** The two voices of the talk: clear, warm, natural in Uzbek, Russian and English. */
export const TALK_VOICES = { female: "Sulafat", male: "Charon" } as const;

const LANG_CODE: Record<string, string> = {
  uz: "uz-UZ",
  "uz-Cyrl": "uz-UZ",
  ru: "ru-RU",
  en: "en-US",
};

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
    voice: keyof typeof TALK_VOICES;
  },
) {
  const loc = asLocale(input.locale);
  const mimeType = input.mime.split(";")[0] || "audio/webm";
  const heardRes = await generate(
    [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: Buffer.from(input.audio).toString("base64") } },
          {
            text: `Transcribe exactly what is said in this short recording, in the language spoken (Uzbek in Latin script; the user usually speaks ${aiLanguage(loc)}). Output only the words. If nothing is said or it is only noise, output nothing.`,
          },
        ],
      },
    ],
    { temperature: 0, maxOutputTokens: 1024 },
    { timeoutMs: 45_000 },
  );
  const heard = (heardRes.text ?? "").trim();
  if (!heard) return { heard: "", reply: "", conversationId: input.conversationId, audio: null };

  const turn = await runAssistant(ctx, {
    conversationId: input.conversationId,
    message: heard,
    mode: "talk",
    spoken: true,
    locale: input.locale,
    timeZone: input.timeZone,
  });
  const text = forSpeech(turn.reply);
  let audio: string | null = null;
  if (text) {
    try {
      const { pcm, rate } = await speak(
        [{ speaker: "nodi", text }],
        () => TALK_VOICES[input.voice],
        {
          style:
            "Say this as a warm, friendly conversation partner on a call: natural and fluent, clear pronunciation, lively but calm pace:",
          languageCode: LANG_CODE[loc],
          timeoutMs: 60_000,
        },
      );
      audio = encodeMp3(pcm, rate).toString("base64");
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      // No speech right now: the reply is still shown (and read by the browser).
    }
  }
  return { heard, reply: turn.reply, conversationId: turn.conversationId, audio };
}

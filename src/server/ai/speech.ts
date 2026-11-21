/**
 * The voice of the live talk: Gemini speech (ElevenLabs was removed on
 * 2026-11-21). When every speech model is spent for the day the talk goes on
 * without a voice instead of waiting on each one.
 */
import "server-only";
import type { AppContext } from "@/db";
import { AppError } from "@/lib/errors";
import { encodeMp3 } from "../audiobook";
import { speak, speakLive, speechLeft } from "./gemini";

const GEMINI_VOICE = { female: "Sulafat", male: "Charon" } as const;
const GEMINI_LANG: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };

export type TalkVoice = {
  /** It can say one sentence at a time (Gemini's few daily requests cannot). */
  chunked: boolean;
  /** Speaks one sentence as it is made; false if it could not. */
  sentence?: (text: string, onPcm: (b64: string, rate: number) => void) => Promise<boolean>;
  say: (text: string) => Promise<Buffer | null>;
  /** Speaks the whole reply as it is made; false if it could not. */
  live?: (text: string, onPcm: (b64: string, rate: number) => void) => Promise<boolean>;
};

/** The longest reply a turn may speak (lib: the budget checks count this much). */
export const MAX_TURN_CHARS = 1500;

/** Chooses the best voice still allowed for this turn; the choice holds for its sentences. */
export async function talkVoice(
  _ctx: AppContext,
  /** The language spoken (two letters), or where to read it once known (asked per sentence). */
  language: string | (() => string),
  voice: "female" | "male",
  signal?: AbortSignal,
): Promise<TalkVoice> {
  const lang = () => (typeof language === "function" ? language() : language);
  // Every speech model spent today: no voice, and no seconds lost asking each one.
  if (!(await speechLeft()))
    return { chunked: false, live: async () => false, say: async () => null };
  return {
    chunked: false,
    live: (text, onPcm) =>
      speakLive(text, GEMINI_VOICE[voice], onPcm, { languageCode: GEMINI_LANG[lang()], signal }),
    say: async (text) => {
      try {
        const { pcm, rate } = await speak([{ speaker: "ai", text }], () => GEMINI_VOICE[voice], {
          languageCode: GEMINI_LANG[lang()],
          timeoutMs: 45_000,
        });
        return encodeMp3(pcm, rate);
      } catch (err) {
        if (err instanceof AppError) return null;
        throw err;
      }
    },
  };
}

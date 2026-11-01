/**
 * Live voice talk: a short recording → what was said and in which language →
 * the companion's reply (the same conversation as the chat), spoken sentence by
 * sentence while it is written, so the first words come quickly
 * (server/ai/speech.ts picks the voice). Premium; others can try it a few times
 * a day. If speech is not available, the reply still comes as text.
 */
import "server-only";
import { db, type AppContext } from "@/db";
import { aiLanguage, asLocale } from "@/i18n/config";
import { AppError } from "@/lib/errors";
import { limitsFor } from "../premium";
import { hitRateLimit } from "../rate-limit";
import { runAssistant } from "./assistant";
import { generate } from "./gemini";
import { MAX_TURN_CHARS, talkVoice, type TalkVoice } from "./speech";

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
    .trim();

/** The next speakable piece of `text`: whole sentences, or null if it should wait. */
export function nextSentences(text: string, min: number) {
  const re = /[.!?…]+["»”)]*(\s+|$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    if (end >= min && (end < text.length || /\s$/.test(m[0]))) return end;
  }
  return null;
}

export type VoiceEvent =
  | { t: "heard"; heard: string }
  | { t: "conv"; conversationId: string }
  | { t: "text"; piece: string }
  | { t: "audio"; audio: string }
  | { t: "pcm"; audio: string; rate: number }
  | { t: "done"; reply: string; conversationId: string | null; visuals: unknown[] };

/** May this person talk now? (before anything is streamed) */
export async function voiceGate(ctx: AppContext) {
  if (ctx.superadminAccount) return;
  const plan = await limitsFor(ctx);
  if (plan.premium) return;
  const left = await hitRateLimit(db, `voice-free:${ctx.userId}`, FREE_VOICE_TURNS, 86_400);
  if (!left.allowed) throw new AppError("PREMIUM_REQUIRED", "voice");
}

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
  emit: (e: VoiceEvent) => void,
  signal?: AbortSignal,
) {
  const loc = asLocale(input.locale);
  const mimeType = input.mime.split(";")[0] || "audio/webm";
  const data = Buffer.from(input.audio).toString("base64");
  // The model hears the recording itself, so the answer does not wait for the
  // written words: both are asked for at once.
  const heardNow = (async () => {
    const res = await generate(
      [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data } },
            {
              text: `Transcribe exactly what is said in this short recording (the user usually speaks ${aiLanguage(loc)}; Uzbek in Latin script). Answer in one line: the two-letter language code, then "|", then the words, e.g. "uz|Salom". If nothing is said or it is only noise, answer "-".`,
            },
          ],
        },
      ],
      { temperature: 0, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 512 } },
      { timeoutMs: 30_000 },
    );
    const raw = (res.text ?? "").trim();
    const m = /^([a-z]{2})\|([\s\S]+)$/.exec(raw);
    return {
      heard: (m ? m[2] : raw === "-" ? "" : raw).trim(),
      lang: m?.[1] ?? (loc === "uz-Cyrl" ? "uz" : loc),
    };
  })();

  // Sentences are spoken one after another, each sent as it is made.
  let speaker: TalkVoice | null = null;
  let sent = Promise.resolve();
  let spent = 0;
  const speakOut = (piece: string) => {
    const text = forSpeech(piece).slice(0, MAX_TURN_CHARS - spent);
    const voice = speaker;
    if (!text || !voice || signal?.aborted) return;
    spent += text.length;
    sent = sent.then(async () => {
      if (signal?.aborted) return;
      const live = voice.sentence
        ? await voice
            .sentence(text, (audio, rate) => emit({ t: "pcm", audio, rate }))
            .catch(() => false)
        : false;
      if (live) return;
      const mp3 = await voice.say(text).catch(() => null);
      if (mp3) emit({ t: "audio", audio: mp3.toString("base64") });
    });
  };

  let pending = "";
  let first = true;
  const flush = () => {
    if (!speaker?.chunked) return;
    for (;;) {
      const end = nextSentences(pending, first ? 8 : 40);
      if (end == null) break;
      speakOut(pending.slice(0, end));
      pending = pending.slice(end);
      first = false;
    }
  };
  const ready = heardNow.then(async ({ heard, lang }) => {
    emit({ t: "heard", heard });
    if (!heard) return;
    speaker = await talkVoice(ctx, lang, input.voice, signal);
    flush();
  });
  ready.catch(() => {});
  const turn = await runAssistant(ctx, {
    conversationId: input.conversationId,
    message: "…",
    audio: { mimeType, data },
    heard: heardNow.then((h) => h.heard),
    spoken: true,
    locale: input.locale,
    timeZone: input.timeZone,
    onConversation: (id) => emit({ t: "conv", conversationId: id }),
    onText: (piece) => {
      emit({ t: "text", piece });
      pending += piece;
      flush();
    },
  });
  await ready;
  if (!turn.reply) return;
  const voice = speaker as TalkVoice | null;
  if (voice?.live) {
    const text = forSpeech(turn.reply).slice(0, MAX_TURN_CHARS);
    const ok = await voice
      .live(text, (audio, rate) => emit({ t: "pcm", audio, rate }))
      .catch(() => false);
    if (!ok) speakOut(turn.reply);
  } else speakOut(spent + pending.length > 0 ? pending : turn.reply);
  await sent;
  emit({
    t: "done",
    reply: turn.reply,
    conversationId: turn.conversationId,
    visuals: turn.visuals ?? [],
  });
}

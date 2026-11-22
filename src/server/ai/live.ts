/**
 * The live talk on Gemini Live: the browser talks to Google over one WebSocket
 * (speech in, speech out, Google's own end-of-speech detection), so the first
 * sound comes in about half a second instead of a recording → reply → voice
 * chain. The server only hands out a one-use, short-lived token whose model
 * and instructions are LOCKED (the browser cannot change who it talks to or
 * what it was told), and keeps the conversation: each finished turn is saved
 * like any other assistant message. Cards (show_card) are drawn by the
 * browser through `liveCard`. Nothing here changes the user's data; asking for
 * a change gets "say it in the chat", where cards are confirmed.
 */
import "server-only";
import { GoogleGenAI, Modality } from "@google/genai";
import { and, desc, eq } from "drizzle-orm";
import { db, withUser, type AppContext } from "@/db";
import { aiConversations, aiMessages } from "@/db/schema";
import { aiLanguage, asLocale } from "@/i18n/config";
import { AppError } from "@/lib/errors";
import { getAiSettings } from "../settings";
import { hitRateLimit } from "../rate-limit";
import { limitsFor } from "../premium";
import { knownContext, persona } from "./assistant";
import { isAiConfigured } from "./gemini";
import { runTool, toolsForGemini } from "./tools";
import { voiceGate } from "./voice";

/**
 * Fastest first (measured from Tashkent, 2026-11-22): ~0.6 s from a typed question
 * to the first sound, ~1.3 s from the end of speech (Google waits for the pause).
 */
export const LIVE_MODELS = [
  "gemini-3.1-flash-live-preview",
  "gemini-3.8-live",
  "gemini-2.5-flash-native-audio-latest",
];
const VOICES = { female: "Sulafat", male: "Charon" } as const;
const LANG: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US" };

const LIVE_RULES = `

THIS IS A LIVE VOICE CONVERSATION (like a phone call)
- Answer at once. Open with a short first sentence so your voice starts immediately. No greeting, no filler.
- Simple question: one or two clear sentences. When something needs explaining, explain it properly in flowing spoken sentences, up to about a minute.
- Spoken words only: no lists, headings, emojis, links or symbols; numbers and abbreviations as they are said.
- What you know about the person (their library, progress, notes, goals) is in the profile above: use it directly.
- To SHOW something (steps of a process, a timeline, a comparison, numbers, a summary, a quiz question) call show_card while you speak; one card per answer is enough.
- In this voice mode you cannot change their data (add, edit, delete, plan). If they ask for that, say in one sentence that you will do it when they write it in the chat, where they can confirm it.
- If the words sound garbled, take the likely meaning or ask briefly.`;

async function history(ctx: AppContext, conversationId: string | null) {
  if (!conversationId) return "";
  const rows = await withUser(db, ctx, (tx) =>
    tx
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.userId, ctx.userId)))
      .orderBy(desc(aiMessages.createdAt))
      .limit(12),
  );
  if (!rows.length) return "";
  const lines = rows
    .reverse()
    .map((r) => `${r.role === "user" ? "User" : "You"}: ${String(r.content).slice(0, 600)}`);
  return `\n\nTHIS CONVERSATION SO FAR\n${lines.join("\n")}`;
}

/** May this person use the AI now (switch, pause, daily limit)? Throws like runAssistant. */
async function aiAllowed(ctx: AppContext) {
  if (!isAiConfigured()) throw new AppError("AI_UNAVAILABLE", "not_configured");
  const settings = await getAiSettings(db);
  if (!settings.enabled) throw new AppError("AI_UNAVAILABLE", "disabled");
  if (ctx.superadminAccount) return;
  const plan = await limitsFor(ctx);
  const daily = await hitRateLimit(db, `ai:${ctx.userId}`, plan.aiDaily, 86_400);
  if (!daily.allowed)
    throw new AppError("RATE_LIMITED", undefined, {
      resetAt: daily.resetAt.toISOString(),
      premium: plan.premium,
    });
}

/** A one-use token for one live session, its model and instructions locked in. */
export async function liveSession(
  ctx: AppContext,
  input: {
    conversationId: string | null;
    locale: string;
    timeZone: string;
    voice: "female" | "male";
  },
) {
  await voiceGate(ctx);
  await aiAllowed(ctx);
  const [[context, profile, memory], earlier] = await Promise.all([
    knownContext(ctx, true),
    history(ctx, input.conversationId),
  ]);
  const loc = asLocale(input.locale);
  const lang = loc === "uz-Cyrl" ? "uz" : loc;
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timeZone,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date());
  const systemInstruction =
    persona(!!ctx.superadminAccount, profile, memory) +
    `\n\nNow: ${now} (${input.timeZone}). Speak ${aiLanguage(loc)} unless the user speaks another language; then switch at once. Uzbek is spoken naturally in Latin script.\n\nWHAT YOU KNOW\n${context}` +
    earlier +
    LIVE_RULES;
  const config = {
    responseModalities: [Modality.AUDIO],
    systemInstruction,
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[input.voice] } },
      ...(LANG[lang] ? { languageCode: LANG[lang] } : {}),
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: [{ functionDeclarations: toolsForGemini(["show_card"]) }],
  };
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
    httpOptions: { apiVersion: "v1alpha" },
  });
  const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
  let lastErr: unknown = null;
  for (const model of LIVE_MODELS) {
    try {
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          // The session must start within 2 minutes and may last up to 30.
          newSessionExpireTime: minutes(2),
          expireTime: minutes(30),
          liveConnectConstraints: { model, config },
          httpOptions: { apiVersion: "v1alpha" },
        },
      });
      if (token.name) return { token: token.name, model, models: LIVE_MODELS };
    } catch (err) {
      lastErr = err;
    }
  }
  console.error("[nodinest] live token failed:", lastErr instanceof Error ? lastErr.message : lastErr);
  throw new AppError("AI_UNAVAILABLE", "live");
}

/** One finished live turn, kept in the conversation (a new one is made for the first turn). */
export async function saveLiveTurn(
  ctx: AppContext,
  input: { conversationId: string | null; heard: string; reply: string },
) {
  const heard = input.heard.trim().slice(0, 4000);
  const reply = input.reply.trim().slice(0, 8000);
  if (!heard && !reply) return { conversationId: input.conversationId };
  // Turns after the first count like the classic talk's (the free plan's few a day).
  await voiceGate(ctx);
  return withUser(db, ctx, async (tx) => {
    let id = input.conversationId;
    if (id) {
      const [c] = await tx
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, ctx.userId)));
      if (!c) id = null;
    }
    if (!id) {
      const [c] = await tx
        .insert(aiConversations)
        .values({ userId: ctx.userId, title: (heard || reply).slice(0, 80) })
        .returning({ id: aiConversations.id });
      id = c.id;
    }
    const at = Date.now();
    if (heard)
      await tx.insert(aiMessages).values({
        conversationId: id,
        userId: ctx.userId,
        role: "user",
        content: heard,
        createdAt: new Date(at),
      });
    if (reply)
      await tx.insert(aiMessages).values({
        conversationId: id,
        userId: ctx.userId,
        role: "model",
        content: reply,
        toolTrace: { live: true },
        createdAt: new Date(at + 1),
      });
    await tx
      .update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(eq(aiConversations.id, id));
    return { conversationId: id };
  });
}

/** A show_card call from the live model, turned into the card the screen draws. */
export async function liveCard(ctx: AppContext, args: unknown, locale: string, timeZone: string) {
  const r = (await runTool("show_card", args, ctx, {
    timeZone,
    locale,
  } as Parameters<typeof runTool>[3])) as { card: unknown };
  return r.card;
}

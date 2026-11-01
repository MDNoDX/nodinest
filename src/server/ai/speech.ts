/**
 * The voice of the live talk: ElevenLabs (the clearest Uzbek), inside a hard
 * monthly budget; when it is used up, or a person's daily share is, Gemini
 * speaks instead. Nothing here can create a bill: the count stops well below
 * the plan's allowance (ELEVEN_MONTHLY_CHARS) and is checked against the real
 * usage ElevenLabs reports. Audiobooks never use ElevenLabs: they would empty
 * the month in minutes.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, type AppContext } from "@/db";
import { appSettings } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { encodeMp3 } from "../audiobook";
import { hitRateLimit } from "../rate-limit";
import { speak } from "./gemini";

const KEY = "eleven_usage";
const API = "https://api.elevenlabs.io/v1";
const key = () => process.env.ELEVENLABS_API_KEY ?? "";
const monthly = () => Number(process.env.ELEVEN_MONTHLY_CHARS ?? 9000);
/** A person's share a day, so one long talk does not empty the month. */
const DAILY_PER_USER = 800;

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Characters used this month by our count. */
async function usedChars() {
  const [r] = await db
    .select({ v: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, KEY));
  const v = r?.v as { month?: string; chars?: number } | undefined;
  return v?.month === thisMonth() ? (v.chars ?? 0) : 0;
}

async function addChars(n: number) {
  const value = { month: thisMonth(), chars: n };
  await db
    .insert(appSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: sql`case when ${appSettings.value}->>'month' = ${value.month}
          then jsonb_build_object('month', ${value.month}::text,
            'chars', coalesce((${appSettings.value}->>'chars')::int, 0) + ${n}::int)
          else ${JSON.stringify(value)}::jsonb end`,
      },
    });
}

let real: { left: number; at: number } | null = null;
/** What ElevenLabs itself says is left (asked every 10 minutes). */
async function realLeft() {
  if (real && Date.now() - real.at < 600_000) return real.left;
  const r = await fetch(`${API}/user/subscription`, {
    headers: { "xi-api-key": key() },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) return real?.left ?? 0;
  const d = (await r.json()) as { character_count?: number; character_limit?: number };
  real = { left: (d.character_limit ?? 0) - (d.character_count ?? 0), at: Date.now() };
  return real.left;
}

let voices: { female?: string; male?: string; at: number } | null = null;
async function voiceId(kind: "female" | "male") {
  const fixed = process.env[kind === "female" ? "ELEVEN_VOICE_F" : "ELEVEN_VOICE_M"];
  if (fixed) return fixed;
  if (!voices || Date.now() - voices.at > 3_600_000) {
    const r = await fetch(`${API}/voices`, {
      headers: { "xi-api-key": key() },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    const d = r?.ok
      ? ((await r.json()) as { voices?: { voice_id: string; labels?: { gender?: string } }[] })
      : null;
    const list = d?.voices ?? [];
    voices = {
      female: list.find((v) => v.labels?.gender === "female")?.voice_id,
      male: list.find((v) => v.labels?.gender === "male")?.voice_id,
      at: Date.now(),
    };
  }
  return voices[kind];
}

async function elevenLabs(text: string, kind: "female" | "male", lang: string) {
  const id = await voiceId(kind);
  if (!id) return null;
  const r = await fetch(`${API}/text-to-speech/${id}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVEN_MODEL ?? "eleven_v4",
      language_code: lang,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!r?.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

const GEMINI_VOICE = { female: "Sulafat", male: "Charon" } as const;
const GEMINI_LANG: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };

/** The reply as MP3, from the best voice still allowed; null if none can speak. */
export async function talkSpeech(
  ctx: AppContext,
  text: string,
  /** The language spoken (two letters). */
  lang: string,
  voice: "female" | "male",
): Promise<Buffer | null> {
  if (key()) {
    const n = text.length;
    const roomMonth = (await usedChars()) + n <= monthly() && (await realLeft()) > n + 200;
    const roomUser =
      ctx.superadminAccount ||
      (await hitRateLimit(db, `eleven:${ctx.userId}`, DAILY_PER_USER / 100, 86_400)).allowed;
    if (roomMonth && roomUser) {
      const mp3 = await elevenLabs(text, voice, lang);
      if (mp3) {
        await addChars(n).catch(() => {});
        return mp3;
      }
    }
  }
  try {
    const { pcm, rate } = await speak([{ speaker: "ai", text }], () => GEMINI_VOICE[voice], {
      languageCode: GEMINI_LANG[lang],
      timeoutMs: 45_000,
    });
    return encodeMp3(pcm, rate);
  } catch (err) {
    if (err instanceof AppError) return null;
    throw err;
  }
}

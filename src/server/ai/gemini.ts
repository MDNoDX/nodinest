/**
 * Thin Gemini wrapper: timeouts, bounded exponential backoff for transient
 * errors, quota awareness (429 → AI_QUOTA, never silently switching
 * providers). The API key stays server-side.
 */
import "server-only";
import {
  ApiError,
  GoogleGenAI,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from "@google/genai";
import { db } from "@/db";
import { AppError } from "@/lib/errors";
import { getAiSettings, saveAiSettings } from "../settings";

export function isAiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

export function aiModel() {
  return process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
}

/**
 * Primary model followed by free-tier fallbacks (GEMINI_FALLBACK_MODELS,
 * comma-separated). Free-tier quotas are per model, so when one model is
 * rate-limited or overloaded the next one is tried. Never a paid provider.
 */
export function aiModels(): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-flash-latest,gemini-3.8-flash")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^[\w.-]+$/.test(m));
  return [...new Set([aiModel(), ...fallbacks])];
}

let client: GoogleGenAI | null = null;
function gemini() {
  if (!isAiConfigured()) throw new AppError("AI_UNAVAILABLE", "not_configured");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return client;
}

/** Per-instance memory of models that are out of quota → no wasted round-trips. */
const cooldown = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryDelayFrom(err: ApiError): number | null {
  const m = err.message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Number(m[1]) * 1000 : null;
}

export async function generate(
  contents: Content[],
  config: GenerateContentConfig,
  opts: {
    timeoutMs?: number;
    /**
     * Long background jobs (a whole book): on a per-minute limit, wait the
     * time Google asks for (≤ 65 s) and try the same model once more.
     */
    patient?: boolean;
  } = {},
): Promise<GenerateContentResponse> {
  let quotaDelay = 0;
  let sawQuota = false;
  const now = Date.now();
  const models = aiModels();
  // Skip models that recently hit their quota (unless all of them did).
  const ready = models.filter((m) => (cooldown.get(m) ?? 0) <= now);
  const waited = new Set<string>();
  const list = ready.length ? ready : models;
  for (let k = 0; k < list.length; k++) {
    const model = list[k];
    try {
      return await generateWith(model, contents, config, opts.timeoutMs ?? 55_000);
    } catch (err) {
      const delay = err instanceof ApiError ? retryDelayFrom(err) : null;
      if (
        opts.patient &&
        err instanceof ApiError &&
        err.status === 429 &&
        delay !== null &&
        delay <= 65_000 &&
        !waited.has(model)
      ) {
        waited.add(model);
        await sleep(delay + 500);
        k--; // the same model again
        continue;
      }
      if (err instanceof ApiError && err.status === 429) {
        sawQuota = true;
        cooldown.set(model, Date.now() + Math.max(retryDelayFrom(err) ?? 0, 5 * 60 * 1000));
        quotaDelay = Math.max(quotaDelay, retryDelayFrom(err) ?? 0);
        continue;
      }
      if (err instanceof ApiError && (err.status === 503 || err.status === 404)) continue;
      if (
        err instanceof ApiError &&
        (err.status === 400 || err.status === 401 || err.status === 403)
      ) {
        console.error("[nodinest] gemini request rejected:", err.status);
        throw new AppError("AI_UNAVAILABLE", `status_${err.status}`);
      }
      if (err instanceof AppError) throw err;
      console.error(
        "[nodinest] gemini failed:",
        err instanceof Error ? err.message.slice(0, 200) : "unknown",
      );
    }
  }
  // Every model is out of its DAILY quota: pause AI for everyone (min 10 min).
  // A per-minute limit (short retry delay) passes by itself: no pause.
  if (sawQuota && quotaDelay > 60_000) {
    try {
      const s = await getAiSettings(db);
      await saveAiSettings(
        db,
        {
          ...s,
          pausedUntil: new Date(Date.now() + Math.max(quotaDelay, 10 * 60 * 1000)).toISOString(),
        },
        null,
      );
    } catch {
      /* best effort */
    }
    throw new AppError("AI_QUOTA");
  }
  if (sawQuota) throw new AppError("AI_QUOTA", "per_minute");
  throw new AppError("AI_UNAVAILABLE", "upstream");
}

/** One model with bounded exponential backoff for transient failures. */
async function generateWith(
  model: string,
  contents: Content[],
  config: GenerateContentConfig,
  timeoutMs: number,
) {
  const attempts = 2;
  for (let i = 0; ; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await gemini().models.generateContent({
        model,
        contents,
        config: {
          ...config,
          abortSignal: controller.signal,
          httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } },
        },
      });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const delay = err instanceof ApiError ? retryDelayFrom(err) : null;
      const transient =
        status === 0 || status >= 500 || (status === 429 && delay !== null && delay <= 8000);
      if (!transient || i >= attempts - 1) throw err;
      await sleep(
        status === 429 && delay ? delay + 250 : Math.min(8000, 600 * 2 ** i + Math.random() * 300),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Uploads media to the Gemini Files API (kept by Google for 48 h) and waits
 * until it can be used; returns its URI. For long recordings that are too big
 * to send inline with every request.
 */
export async function uploadToGemini(bytes: Uint8Array, mimeType: string): Promise<string> {
  const ai = gemini();
  let f = await ai.files.upload({
    file: new Blob([new Uint8Array(bytes)], { type: mimeType }),
    config: { mimeType },
  });
  for (let i = 0; i < 40 && f.state === "PROCESSING" && f.name; i++) {
    await sleep(3000);
    f = await ai.files.get({ name: f.name });
  }
  if (f.state === "FAILED" || !f.uri) throw new AppError("AI_UNAVAILABLE", "upload_failed");
  return f.uri;
}

/**
 * Streaming variant of `generate`: yields text as the model writes it. Models
 * are tried in order until one starts answering (quota / overload → next).
 */
export async function* generateStream(
  contents: Content[],
  config: GenerateContentConfig,
  opts: { timeoutMs?: number } = {},
): AsyncGenerator<string> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  let sawQuota = false;
  const now = Date.now();
  const models = aiModels();
  const ready = models.filter((m) => (cooldown.get(m) ?? 0) <= now);
  // Each model gets a second try after a short pause when it is overloaded (503).
  const attempts = (ready.length ? ready : models).flatMap((m) => [m, m]);
  for (let n = 0; n < attempts.length; n++) {
    const model = attempts[n];
    if (n % 2 === 1) await sleep(1200);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let started = false;
    try {
      const stream = await gemini().models.generateContentStream({
        model,
        contents,
        config: {
          ...config,
          abortSignal: controller.signal,
          httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } },
        },
      });
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          started = true;
          yield text;
        }
      }
      if (started) return;
    } catch (err) {
      if (started) throw err; // mid-answer: nothing sensible to retry
      if (err instanceof ApiError && err.status === 429) {
        sawQuota = true;
        cooldown.set(model, Date.now() + Math.max(retryDelayFrom(err) ?? 0, 5 * 60 * 1000));
        continue;
      }
      if (
        err instanceof ApiError &&
        (err.status === 400 || err.status === 401 || err.status === 403)
      )
        throw new AppError("AI_UNAVAILABLE", `status_${err.status}`);
      console.error(
        "[nodinest] gemini stream failed:",
        err instanceof Error ? err.message.slice(0, 200) : "unknown",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AppError(sawQuota ? "AI_QUOTA" : "AI_UNAVAILABLE", sawQuota ? undefined : "upstream");
}

/**
 * Speech models, best first. The free tier allows only ~10 requests a day per
 * model, so all of them are used in turn. 3.8 models take one text part per
 * speaker ("speech metadata"); older ones a "Speaker: line" transcript.
 */
function ttsModels(): string[] {
  return (
    process.env.GEMINI_TTS_MODELS ??
    "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts"
  )
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^[\w.-]+$/.test(m));
}
const usesSpeechMetadata = (model: string) => /gemini-3\.8/.test(model);

export type SpeechLine = { speaker: string; text: string };

/** 16-bit mono PCM from a WAV file or a raw "audio/L16;rate=…" answer. */
function toPcm(data: string, mime: string): { pcm: Int16Array; rate: number } {
  const buf = Buffer.from(data, "base64");
  if (/wav/i.test(mime) && buf.toString("ascii", 0, 4) === "RIFF") {
    const rate = buf.readUInt32LE(24);
    let at = 12;
    while (at + 8 <= buf.length) {
      const id = buf.toString("ascii", at, at + 4);
      const size = buf.readUInt32LE(at + 4);
      if (id === "data") {
        const body = buf.subarray(at + 8, Math.min(buf.length, at + 8 + size));
        return {
          pcm: new Int16Array(
            body.buffer.slice(body.byteOffset, body.byteOffset + (body.length & ~1)),
          ),
          rate,
        };
      }
      at += 8 + size + (size & 1);
    }
    throw new AppError("AI_UNAVAILABLE", "bad_audio");
  }
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
  return {
    pcm: new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + (buf.length & ~1))),
    rate,
  };
}

/**
 * Speaks lines by at most TWO speakers (the API's limit per request) with the
 * given prebuilt voices. Models are tried in order (quota / overload → next).
 */
export async function speak(
  lines: SpeechLine[],
  voiceOf: (speaker: string) => string,
  opts: { timeoutMs?: number } = {},
): Promise<{ pcm: Int16Array; rate: number }> {
  const speakers = [...new Set(lines.map((l) => l.speaker))];
  if (!lines.length || speakers.length > 2) throw new AppError("VALIDATION", "speakers");
  const single = speakers.length === 1;
  // Plain tokens as speaker names: real names may contain spaces or colons.
  const token = (s: string) => `Speaker${speakers.indexOf(s) + 1}`;
  const contentsFor = (model: string): Content[] => [
    {
      role: "user",
      parts: single
        ? [{ text: lines.map((l) => l.text).join("\n") }]
        : usesSpeechMetadata(model)
          ? lines.map(
              (l) => ({ text: l.text, speechMetadata: { speaker: token(l.speaker) } }) as never,
            )
          : [{ text: lines.map((l) => `${token(l.speaker)}: ${l.text}`).join("\n") }],
    },
  ];
  const speechConfig = single
    ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceOf(speakers[0]) } } }
    : {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: speakers.map((s) => ({
            speaker: token(s),
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceOf(s) } },
          })),
        },
      };
  let sawQuota = false;
  const now = Date.now();
  const models = ttsModels();
  const ready = models.filter((m) => (cooldown.get(m) ?? 0) <= now);
  for (const model of ready.length ? ready : models) {
    try {
      const res = await generateWith(
        model,
        contentsFor(model),
        { responseModalities: ["AUDIO"], speechConfig },
        opts.timeoutMs ?? 90_000,
      );
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part?.inlineData?.data) continue;
      return toPcm(part.inlineData.data, part.inlineData.mimeType ?? "audio/wav");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        sawQuota = true;
        cooldown.set(model, Date.now() + Math.max(retryDelayFrom(err) ?? 0, 5 * 60 * 1000));
        continue;
      }
      if (
        err instanceof ApiError &&
        (err.status === 503 || err.status === 404 || err.status === 500)
      )
        continue;
      if (err instanceof ApiError && err.status === 400) {
        console.error("[nodinest] tts rejected:", err.message.slice(0, 200));
        continue;
      }
      if (err instanceof AppError) throw err;
      console.error(
        "[nodinest] tts failed:",
        err instanceof Error ? err.message.slice(0, 200) : "unknown",
      );
    }
  }
  throw new AppError(sawQuota ? "AI_QUOTA" : "AI_UNAVAILABLE", "tts");
}

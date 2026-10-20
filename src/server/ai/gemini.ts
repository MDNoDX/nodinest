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
  opts: { timeoutMs?: number } = {},
): Promise<GenerateContentResponse> {
  let quotaDelay = 0;
  let sawQuota = false;
  const now = Date.now();
  const models = aiModels();
  // Skip models that recently hit their quota (unless all of them did).
  const ready = models.filter((m) => (cooldown.get(m) ?? 0) <= now);
  for (const model of ready.length ? ready : models) {
    try {
      return await generateWith(model, contents, config, opts.timeoutMs ?? 55_000);
    } catch (err) {
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
  if (sawQuota) {
    // Every model is out of quota: pause AI for everyone (min 10 min).
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

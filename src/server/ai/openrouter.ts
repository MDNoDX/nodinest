/**
 * The reserve for text answers: when every Gemini model is out of quota, the
 * question goes to OpenRouter's free models (no pictures, files or tools).
 * Only the `:free` models are ever called, so this can never cost money.
 */
import "server-only";
import type { Content, GenerateContentConfig, GenerateContentResponse } from "@google/genai";

const models = () =>
  (
    process.env.OPENROUTER_MODELS ??
    "nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free,thinkingmachines/inkling:free"
  )
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.endsWith(":free"));

export const openRouterReady = () => !!process.env.OPENROUTER_API_KEY;

const textOf = (c: Content) =>
  (c.parts ?? [])
    .map((p) => p.text ?? "")
    .filter(Boolean)
    .join("\n");

export async function openRouterGenerate(
  contents: Content[],
  config: GenerateContentConfig,
): Promise<GenerateContentResponse | null> {
  if (!openRouterReady()) return null;
  const system = typeof config.systemInstruction === "string" ? config.systemInstruction : "";
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...contents
      .map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: textOf(c) }))
      .filter((m) => m.content),
  ];
  for (const model of models()) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "content-type": "application/json",
          "http-referer": process.env.BETTER_AUTH_URL ?? "https://nodinest.vercel.app",
          "x-title": "NodiNote",
        },
        body: JSON.stringify({ model, messages, temperature: config.temperature ?? 0.5 }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!r.ok) continue;
      const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const text = d.choices?.[0]?.message?.content?.trim();
      if (text) return { text, functionCalls: undefined, candidates: [] } as never;
    } catch {
      /* the next model */
    }
  }
  return null;
}

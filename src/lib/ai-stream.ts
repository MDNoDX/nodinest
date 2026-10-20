"use client";

/**
 * Streams an AI panel answer: `onText` gets the whole text so far after every
 * piece. Resolves with the final text and extra facts, or an error code.
 */
export async function streamAi<M = Record<string, unknown>>(
  kind: "ask" | "write",
  input: Record<string, unknown>,
  onText: (text: string) => void,
): Promise<{ ok: true; text: string; meta: M } | { ok: false; code: string }> {
  let res: Response;
  try {
    res = await fetch("/api/ai/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, input }),
    });
  } catch {
    return { ok: false, code: "INTERNAL" };
  }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, code: j?.error ?? "INTERNAL" };
  }
  let meta = {} as M;
  try {
    meta = JSON.parse(decodeURIComponent(res.headers.get("x-nn-meta") ?? "%7B%7D")) as M;
  } catch {
    /* no extra facts */
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    onText(text);
  }
  text = text.trim();
  return text ? { ok: true, text, meta } : { ok: false, code: "AI_UNAVAILABLE" };
}

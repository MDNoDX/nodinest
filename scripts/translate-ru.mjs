// Fills messages/ru.json: every key still equal to English is translated with
// Gemini (batches of 40, placeholders checked), then written back. Repeatable —
// run again when the free daily quota is back:
//   GEMINI_API_KEY=… node scripts/translate-ru.mjs
import { readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("GEMINI_API_KEY is not set");
const MODELS = (
  process.env.MODELS ?? "gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest"
).split(",");
const SYSTEM = `You translate the UI of NodiNote, a personal reading & learning notebook web app, from English into natural, concise Russian as used in modern apps.
Keep ICU MessageFormat EXACTLY: {name} placeholders unchanged; in {count, plural, ...} use Russian categories one/few/many/other with correct forms and keep #; keep <tag>…</tag> names. Keep product names (NodiNote, Telegram, Google, YouTube, AI, PDF, EPUB, ISBN, Premium). "Taqriz" → «рецензия», "Darsxona" → «Библиотека». Return a JSON object with the same keys.`;

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const ru = JSON.parse(readFileSync("messages/ru.json", "utf8"));
const flat = (o, p = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") out[p + k] = v;
    else flat(v, `${p}${k}.`, out);
  }
  return out;
};
const E = flat(en);
const R = flat(ru);
const args = (s) =>
  [...s.matchAll(/(?<!(?:=\d+|zero|one|two|few|many|other)\s?)\{(\w+)\s*[,}]/g)]
    .map((m) => m[1])
    .sort()
    .join();
const todo = Object.keys(E).filter((k) => (R[k] ?? E[k]) === E[k] && /[a-z]{3}/i.test(E[k]));
console.log("to translate", todo.length);

async function call(batch) {
  for (const model of MODELS) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(batch) }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(240_000),
      },
    ).catch(() => null);
    if (!r?.ok) continue;
    const d = await r.json();
    try {
      return JSON.parse(d.candidates[0].content.parts.map((p) => p.text ?? "").join(""));
    } catch {
      continue;
    }
  }
  return null;
}

let done = 0;
for (let i = 0; i < todo.length; i += 40) {
  const batch = Object.fromEntries(todo.slice(i, i + 40).map((k) => [k, E[k]]));
  const out = await call(batch);
  if (!out) {
    console.log("stopped (quota?) at", i);
    break;
  }
  for (const k of Object.keys(batch))
    if (typeof out[k] === "string" && out[k].trim() && args(out[k]) === args(E[k])) {
      R[k] = out[k];
      done++;
    }
  const build = (o, p = "") =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [
        k,
        typeof v === "string" ? (R[p + k] ?? v) : build(v, `${p}${k}.`),
      ]),
    );
  writeFileSync("messages/ru.json", JSON.stringify(build(en), null, 2) + "\n");
  console.log(i + 40, "/", todo.length);
}
console.log("translated", done);

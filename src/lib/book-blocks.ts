/**
 * A page of a book as it is shown: blocks instead of the PDF's raw lines.
 * h title · p narration · d a line of dialogue · q quotation or verse · c centred
 * (title pages). The AI lays pages out this way; until then `blocksFromParas`
 * gives a plain version. Pure; used by the server and the reader.
 */
import type { Para } from "./reflow";

export type BlockKind = "h" | "p" | "d" | "q" | "c";
/** `s`: who says a line of dialogue, when the text makes it clear. */
export type BookBlock = { k: BlockKind; t: string; s?: string };

const DASH = /^[—–-]\s/;
const QUOTE = /^["«“]/;
const SPOKEN = /(“[^”]*(?:”|$)|«[^»]*(?:»|$)|"[^"]*(?:"|$))/;
/** "— Speech,— he said.— More": the dash after a mark goes back to the narrator or out of him. */
const TURN = /(?<=[,.!?…:])\s*[—–]\s*(?=[\p{L}«"“])/u;

/** One piece of speech whose dashes hold the narrator's words between its parts. */
function turns(text: string): BookBlock[] {
  const open = /^[—–-]\s*/.exec(text)?.[0] ?? "";
  return text
    .slice(open.length)
    .split(TURN)
    .map((t, i) => (i % 2 ? { k: "p" as const, t } : { k: "d" as const, t: `${open}${t}` }));
}

/** “Speech,” he said. “More.” → speech and narration apart, word for word. */
export function speechBlocks(text: string): BookBlock[] {
  if (DASH.test(text)) return turns(text);
  if (!QUOTE.test(text)) return [{ k: "p", t: text }];
  return text
    .split(SPOKEN)
    .map((t) => t.trim())
    .filter(Boolean)
    .flatMap((t) => (QUOTE.test(t) ? turns(t) : [{ k: "p" as const, t }]));
}

export const blocksFromParas = (paras: Para[]): BookBlock[] =>
  paras.flatMap((p) => (p.heading ? [{ k: "h" as const, t: p.text }] : speechBlocks(p.text)));

const letters = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "").length;

/**
 * The layout may mend lines and drop a running header, but the author's words
 * stay: a result much shorter or longer than the page is not trusted.
 */
export function keepsWords(source: string, blocks: BookBlock[]) {
  const a = letters(source);
  const b = letters(blocks.map((x) => x.t).join(" "));
  return a < 20 || (b >= a * 0.82 && b <= a * 1.08);
}

const WORD = /[\p{L}\p{N}]+(?:[.'’ʼ‘-][\p{L}\p{N}]+)*/gu;
const NUMBER = /^\p{N}+$/u;
/** Words of a site's name, and what usually follows it ("kutubxonasi"). */
const SITE = /^(?:https?|www\..+|.+\.(?:com|net|org|uz|ru|info))$/;
const SITE_WORD = /^(?:кутубхонаси|kutubxonasi|kutubxona|библиотека|library)$/;
/** How near the top or bottom of a page, in words. */
const EDGE = 16;
/** Between what is cut out and the rest: gone with it. Never quotes or dialogue dashes. */
const LEFTOVER = /[\s()[\]|/.:;,]/;

type Tok = { w: string; at: number; end: number };
const tokens = (s: string): Tok[] =>
  [...s.matchAll(WORD)].map((m) => ({
    w: m[0].toLocaleLowerCase(),
    at: m.index,
    end: m.index + m[0].length,
  }));

/** A phrase a PDF repeats at the edge of its pages: its words, numbers left out. */
export type Running = string[];

/**
 * What a book prints on page after page: an author and title, a site's name.
 * It is found as a phrase, not as a line, because PDFs often run it together
 * with the page number and the first words of the text.
 */
export function runningPhrases(pages: { content: string }[]): Running[] {
  const seen = new Map<string, number>();
  for (const p of pages) {
    const words = tokens(p.content)
      .map((t) => t.w)
      .filter((w) => !NUMBER.test(w));
    const here = new Set<string>();
    for (const zone of [words.slice(0, EDGE), words.slice(-EDGE)])
      for (let n = 3; n <= 10; n++)
        for (let i = 0; i + n <= zone.length; i++) here.add(zone.slice(i, i + n).join(" "));
    // Two words only right at the edge ("Abdulla Qodiriy").
    for (const zone of [words.slice(0, 5), words.slice(-5)])
      for (let i = 0; i + 2 <= zone.length; i++) here.add(zone.slice(i, i + 2).join(" "));
    for (const k of here) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const min = (k: string) => Math.max(4, pages.length * (k.split(" ").length === 2 ? 0.45 : 0.3));
  const kept: [string, number][] = [];
  for (const [k, n] of [...seen]
    .filter(([k, n]) => n >= min(k))
    .sort((a, b) => b[0].length - a[0].length))
    // A piece of a longer phrase is the same thing, unless it is far more common.
    if (!kept.some(([o, c]) => ` ${o} `.includes(` ${k} `) && c >= n * 0.7)) kept.push([k, n]);
  return kept.map(([k]) => k.split(" "));
}

/** Everything in `toks[i..j]`, with its page number and leftover marks around it. */
function widen(s: string, toks: Tok[], i: number, j: number): [number, number] {
  let a = i;
  let b = j;
  const gap = (x: number, y: number) => [...s.slice(x, y)].every((c) => LEFTOVER.test(c));
  while (a > 0 && NUMBER.test(toks[a - 1].w) && gap(toks[a - 1].end, toks[a].at)) a--;
  while (b + 1 < toks.length && NUMBER.test(toks[b + 1].w) && gap(toks[b].end, toks[b + 1].at)) b++;
  let from = toks[a].at;
  let to = toks[b].end;
  while (from > 0 && LEFTOVER.test(s[from - 1])) from--;
  while (to < s.length && LEFTOVER.test(s[to])) to++;
  return [from, to];
}

const cut = (s: string, [from, to]: [number, number]) =>
  `${s.slice(0, from)}${from && to < s.length ? "\n" : ""}${s.slice(to)}`;

/** The first place one of these marks sits at an edge of `s`. */
function findMark(s: string, phrases: Running[], keepPhrases: boolean) {
  const toks = tokens(s);
  const words = toks.map((t, i) => ({ ...t, i })).filter((t) => !NUMBER.test(t.w));
  const inZone = (k: number) => k < EDGE || k >= words.length - EDGE;
  for (let k = 0; k < words.length; k++) {
    if (SITE.test(words[k].w) && inZone(k)) {
      const next = words[k + 1];
      const end = next && SITE_WORD.test(next.w) ? next : words[k];
      return widen(s, toks, words[k].i, end.i);
    }
    if (keepPhrases) continue;
    // Only at the very edge: the same words inside a sentence are the author's.
    for (const p of phrases)
      if ((k === 0 || k + p.length === words.length) && p.every((w, n) => words[k + n]?.w === w))
        return widen(s, toks, words[k].i, words[k + p.length - 1].i);
  }
  return null;
}

/**
 * The page without those phrases. A site's name goes everywhere; the title
 * stays on the first pages, where the book really is saying its name.
 */
export function stripRunning(content: string, page: number, phrases: Running[]) {
  let s = content;
  for (let n = 0; n < 8; n++) {
    const at = findMark(s, phrases, page <= 2);
    if (!at) break;
    s = cut(s, at);
  }
  return s;
}

/** The same for a page already laid out; a block with no words left goes. */
export function stripBlocks(blocks: BookBlock[], page: number, phrases: Running[]) {
  return blocks
    .map((b) => ({ ...b, t: stripRunning(b.t, page, phrases).trim() }))
    .filter((b) => /[\p{L}\p{N}]/u.test(b.t));
}

/**
 * For text read aloud: a site's name wherever it stands, with the running title
 * printed next to it. A title alone stays, the story itself may say those words.
 */
export function stripSites(text: string, phrases: Running[] = []) {
  let s = text;
  for (let n = 0; n < 400; n++) {
    const toks = tokens(s);
    const words = toks.map((t, i) => ({ ...t, i })).filter((t) => !NUMBER.test(t.w));
    const k = words.findIndex((w) => SITE.test(w.w));
    if (k < 0) break;
    let a = k;
    let b = SITE_WORD.test(words[k + 1]?.w ?? "") ? k + 1 : k;
    for (const p of phrases) {
      if (p.every((w, i) => words[a - p.length + i]?.w === w)) a -= p.length;
      if (p.every((w, i) => words[b + 1 + i]?.w === w)) b += p.length;
    }
    s = cut(s, widen(s, toks, words[a].i, words[b].i));
  }
  return s;
}

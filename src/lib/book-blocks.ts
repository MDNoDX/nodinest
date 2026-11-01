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

/** “Speech,” he said. “More.” → speech and narration apart, word for word. */
export function speechBlocks(text: string): BookBlock[] {
  if (DASH.test(text)) return [{ k: "d", t: text }];
  if (!QUOTE.test(text)) return [{ k: "p", t: text }];
  return text
    .split(SPOKEN)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ k: QUOTE.test(t) ? "d" : "p", t }));
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

/** A running header or footer: the same line on many pages, its page number aside. */
export const repeatKey = (line: string) =>
  line
    .toLocaleLowerCase()
    .replace(/\d+/g, "")
    .replace(/[^\p{L}]+/gu, "");

/**
 * Lines repeated at the edge of many pages (an author and title, a site's
 * name): the reader needs them once. Returns the first page each one is on.
 */
export function repeatedLines(pages: { page: number; content: string }[]) {
  const seen = new Map<string, { n: number; first: number }>();
  for (const p of pages) {
    const lines = p.content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const edge = new Set([...lines.slice(0, 3), ...lines.slice(-3)].map(repeatKey).filter(Boolean));
    for (const k of edge) {
      const e = seen.get(k);
      if (e) e.n++;
      else seen.set(k, { n: 1, first: p.page });
    }
  }
  const min = Math.max(4, pages.length * 0.3);
  return new Map([...seen].filter(([, e]) => e.n >= min).map(([k, e]) => [k, e.first]));
}

/** The page's text without repeated lines (they stay on their first page). */
export function withoutRepeats(content: string, page: number, repeats: Map<string, number>) {
  return content
    .split("\n")
    .filter((l) => {
      const first = repeats.get(repeatKey(l));
      return first == null || first === page;
    })
    .join("\n");
}

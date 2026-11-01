/**
 * A page of a book as it is shown: blocks instead of the PDF's raw lines.
 * h title · p paragraph · d a line of dialogue · q quotation or verse · c centred
 * (title pages). The AI lays pages out this way; until then `blocksFromParas`
 * gives a plain version. Pure; used by the server and the reader.
 */
import type { Para } from "./reflow";

export type BlockKind = "h" | "p" | "d" | "q" | "c";
export type BookBlock = { k: BlockKind; t: string };

const DIALOGUE = /^[—–-]\s|^["«“]/;

export const blocksFromParas = (paras: Para[]): BookBlock[] =>
  paras.map((p) => ({ k: p.heading ? "h" : DIALOGUE.test(p.text) ? "d" : "p", t: p.text }));

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

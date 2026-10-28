/**
 * What the reader highlights inside a paragraph: the user's saved quotes and
 * notes (a selection may span paragraphs: its start or end is matched) and,
 * while searching, the words searched for. Pure; tested.
 */
export type Mark = { id: string; kind: "quote" | "note"; text: string; page: number | null };
export type Piece = string | { t: string; m: Mark } | { t: string; hit: true };

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const fold = (s: string) => s.toLocaleLowerCase().replace(/[‘’ʻʼ`']/g, "'");

export function marked(text: string, marks: Mark[], term = ""): Piece[] {
  const ranges: { a: number; b: number; m?: Mark }[] = [];
  const free = (a: number, b: number) => !ranges.some((r) => a < r.b && b > r.a);
  for (const m of marks) {
    const s = norm(m.text);
    if (s.length < 6) continue;
    let a = text.indexOf(s);
    let b = a >= 0 ? a + s.length : -1;
    if (a < 0 && s.includes(text)) [a, b] = [0, text.length];
    if (a < 0) {
      const head = s.slice(0, 40);
      const tail = s.slice(-40);
      const h = text.indexOf(head);
      const tl = text.indexOf(tail);
      if (h >= 0 && text.length - h < s.length) [a, b] = [h, text.length];
      else if (tl >= 0 && tl + tail.length < s.length) [a, b] = [0, tl + tail.length];
    }
    if (a >= 0 && b > a && free(a, b)) ranges.push({ a, b, m });
  }
  // Searched words (case and apostrophe forms folded; same length, so offsets hold).
  const q = fold(norm(term));
  if (q.length >= 2) {
    const hay = fold(text);
    for (let at = hay.indexOf(q); at >= 0; at = hay.indexOf(q, at + q.length))
      if (free(at, at + q.length)) ranges.push({ a: at, b: at + q.length });
  }
  if (!ranges.length) return [text];
  ranges.sort((x, y) => x.a - y.a);
  const out: Piece[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.a > at) out.push(text.slice(at, r.a));
    out.push(r.m ? { t: text.slice(r.a, r.b), m: r.m } : { t: text.slice(r.a, r.b), hit: true });
    at = r.b;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

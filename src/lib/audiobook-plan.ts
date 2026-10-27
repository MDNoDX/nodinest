/**
 * Pure parts of the audiobook (shared by the server and tests): splitting the
 * book text into segments, cleaning the AI's script lines, and grouping lines
 * into speech requests of at most two voices.
 */
import { lineKey } from "./reflow";

export type ScriptLine = { speaker: string; text: string };
export type Seg = [number, number, number];
type Cast = { characters: { name: string; aliases: string[] }[] };

/** Pages joined into one text + where each page starts (deterministic). */
/** Pages without the running header / footer / navigation lines (by lineKey). */
export function cleanPages<P extends { page: number; content: string }>(
  pages: P[],
  noise: Iterable<string> | undefined,
): P[] {
  const set = new Set(noise ?? []);
  if (!set.size) return pages;
  return pages.map((p) => ({
    ...p,
    content: p.content
      .split("\n")
      .filter((l) => !set.has(lineKey(l)))
      .join("\n"),
  }));
}

export function joinPages(pages: { page: number; content: string }[]) {
  const starts: { page: number; at: number }[] = [];
  let text = "";
  for (const p of pages) {
    if (text) text += "\n\n";
    starts.push({ page: p.page, at: text.length });
    text += p.content;
  }
  return { text, starts };
}

const pageAt = (starts: { page: number; at: number }[], at: number) => {
  let page = starts[0]?.page ?? 1;
  for (const s of starts) if (s.at <= at) page = s.page;
  return page;
};

// ~3 minutes of speech per piece: the free tier allows few speech requests a day.
const SEG = 2600;
const SEG_MIN = 1800;
const SEG_MAX = 3200;

/** Sentence ends in Uzbek and English typography (quotes included). */
const ENDS = [". ", "! ", "? ", "… ", ".\n", "!\n", "?\n"].flatMap((e) => [
  e,
  ...["»", "”", '"', "’"].map((q) => e[0] + q + e.slice(1)),
]);

/**
 * ~3-minute pieces, cut at a paragraph or sentence end. A piece never runs
 * over an offset in `breaks` (where the real text or a chapter starts, even
 * in the middle of a page), so chapters can be started exactly.
 */
export function planText(
  text: string,
  starts: { page: number; at: number }[],
  breaks: number[],
): Seg[] {
  const hard = [...new Set(breaks)].filter((x) => x > 0 && x < text.length).sort((x, y) => x - y);
  const bounds = [0, ...hard, text.length];
  const segs: Seg[] = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const end = bounds[k + 1];
    let a = bounds[k];
    while (a < end) {
      let b = Math.min(end, a + SEG);
      if (b < end && end - a > SEG_MAX) {
        const window = text.slice(a + SEG_MIN, a + SEG_MAX);
        const para = window.lastIndexOf("\n\n");
        const sentence = Math.max(...ENDS.map((m) => window.lastIndexOf(m)));
        const cut =
          para > 200
            ? para
            : sentence > 0
              ? sentence + (ENDS.find((m) => window.startsWith(m, sentence))?.length ?? 2)
              : window.lastIndexOf(" ");
        b = cut > 0 ? a + SEG_MIN + cut : Math.min(end, a + SEG_MAX);
      } else if (b < end) b = end; // a short rest stays with this piece
      if (text.slice(a, b).trim()) segs.push([a, b, pageAt(starts, a)]);
      a = b;
    }
  }
  return segs;
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const HEADING_WORD =
  /^(chapter|part|book|prologue|epilogue|preface|foreword|introduction|interlude|appendix|bob|qism|kitob|muqaddima|so[‘'ʻ’`]?zboshi|kirish|xotima|глава|часть|пролог|эпилог)\b/i;
const ORDINAL_BOB = /^([0-9]+|[ivxlcdm]+)[-.)\s]*(bob|qism|chapter|глава)?\.?$/i;
const UZ_ORDINAL_BOB = /^\p{L}+(inchi|nchi)\s+(bob|qism)\b/iu;

/**
 * Lines that look like chapter titles, from the first lines of every page:
 * "CHAPTER 3", "PROLOGUE", "BRAN", "IKKINCHI BOB", "XII". The AI then
 * decides which of them are real chapters, so the whole book is covered
 * cheaply. `at` is the line's offset in the page text.
 */
export function headingCandidates(pages: { page: number; content: string }[], max = 2500) {
  const out: { page: number; line: string; at: number; next: string }[] = [];
  for (const p of pages) {
    const lines = p.content.split("\n");
    let at = 0;
    let seen = 0;
    for (let i = 0; i < lines.length && seen < 6; i++) {
      const line = lines[i].trim();
      const here = at;
      at += lines[i].length + 1;
      if (!line) continue;
      seen++;
      if (line.length > 70 || (/^\d+$/.test(line) && line.length > 3)) continue;
      const letters = line.replace(/[^\p{L}]/gu, "");
      const upper =
        letters.length >= 2 && letters === letters.toLocaleUpperCase() && /\p{Lu}/u.test(letters);
      if (
        HEADING_WORD.test(line) ||
        ORDINAL_BOB.test(line) ||
        UZ_ORDINAL_BOB.test(line) ||
        (upper && line.split(/\s+/).length <= 8)
      ) {
        const next = lines
          .slice(i + 1)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
        out.push({ page: p.page, line, at: here + lines[i].indexOf(line), next });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

/**
 * Where a chapter title stands in the joined text: the first line on its page
 * (or the next page, for PDFs whose page labels are off by one) that matches
 * the title. Falls back to the page start.
 */
export function locateHeading(
  pages: { page: number; content: string }[],
  starts: { page: number; at: number }[],
  page: number,
  title: string,
): number | null {
  const want = norm(title);
  for (const pg of [page, page + 1, page - 1]) {
    const k = pages.findIndex((p) => p.page === pg);
    if (k < 0) continue;
    let at = 0;
    for (const raw of pages[k].content.split("\n")) {
      const n = norm(raw);
      if (
        want &&
        n &&
        (n === want ||
          (n.startsWith(want) && n.length - want.length < 12) ||
          (want.startsWith(n) && n.length >= 4))
      )
        return starts[k].at + at + raw.indexOf(raw.trim());
      at += raw.length + 1;
    }
  }
  const k = starts.find((s) => s.page >= page);
  return k ? k.at : null;
}

export function cleanLines(raw: unknown, a: Cast): ScriptLine[] {
  type L = ScriptLine & { heading?: boolean };
  const names = new Map<string, string>();
  for (const c of a.characters) {
    names.set(c.name.toLowerCase(), c.name);
    for (const al of c.aliases) names.set(al.toLowerCase(), c.name);
  }
  const out: L[] = [];
  for (const l of Array.isArray(raw) ? raw : []) {
    // Dialogue dashes only mark who speaks: never read them, never voice a bare one.
    const text =
      typeof l?.text === "string" ? l.text.trim().replace(/^[\s—–-]+|[\s—–-]+$/g, "") : "";
    if (!/\p{L}/u.test(text)) continue;
    const speaker =
      names.get(
        String(l?.speaker ?? "")
          .trim()
          .toLowerCase(),
      ) ?? "narrator";
    const last = out.at(-1);
    if (last && last.speaker === speaker && !last.heading) last.text += ` ${text}`;
    else
      out.push({ speaker, text: text.slice(0, 4000), heading: l?.heading === true || undefined });
  }
  return out.map(({ heading, ...x }) =>
    heading ? { ...x, text: /[.!?…]$/.test(x.text) ? x.text : `${x.text}.` } : x,
  );
}

const RUN_CHARS = 3200;
const MAX_RUNS = 3;

/** Lines grouped into requests of at most two voices and ~RUN_CHARS characters. */
function group(lines: ScriptLine[]) {
  const out: ScriptLine[][] = [];
  let cur: ScriptLine[] = [];
  let chars = 0;
  const flush = () => {
    if (cur.length) out.push(cur);
    cur = [];
    chars = 0;
  };
  for (const l of lines) {
    const speakers = new Set([...cur.map((x) => x.speaker), l.speaker]);
    if (cur.length && (speakers.size > 2 || chars + l.text.length > RUN_CHARS)) flush();
    if (l.text.length <= RUN_CHARS) {
      cur.push({ ...l });
      chars += l.text.length;
      continue;
    }
    // A very long line is split at sentence ends.
    for (const piece of l.text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [l.text]) {
      if (chars + piece.length > RUN_CHARS) flush();
      const last = cur.at(-1);
      if (last && last.speaker === l.speaker) last.text += piece;
      else cur.push({ speaker: l.speaker, text: piece });
      chars += piece.length;
    }
  }
  flush();
  return out;
}

/**
 * Requests for one segment. Each costs one of the few free speech requests,
 * so when a scene needs too many (three or more characters taking turns),
 * the characters who say least are read by the narrator's voice.
 */
export function runs(lines: ScriptLine[]) {
  let cur = lines;
  let out = group(cur);
  const minor = [...new Set(lines.map((l) => l.speaker))]
    .filter((s) => s !== "narrator")
    .map((s) => ({
      s,
      n: lines.filter((l) => l.speaker === s).reduce((a, l) => a + l.text.length, 0),
    }))
    .sort((a, b) => a.n - b.n);
  while (out.length > MAX_RUNS && minor.length) {
    const { s } = minor.shift()!;
    cur = cur.map((l) => (l.speaker === s ? { ...l, speaker: "narrator" } : l));
    out = group(cur);
  }
  return out;
}

const wordsOf = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[‘’ʻʼ`']/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * How faithfully a script keeps the author's words: the share of the
 * passage's words found in the script in the same order, and the ones left
 * out. Numbers (spelled out in the script) are not counted. Not used for
 * text in another script (e.g. Uzbek Cyrillic written out in Latin).
 */
export function faithfulness(source: string, script: string) {
  const src = wordsOf(source).filter((w) => !/\d/.test(w));
  const out = wordsOf(script);
  const cyr = src.filter((w) => /[Ѐ-ӿ]/.test(w)).length;
  if (!src.length || cyr > src.length * 0.3) return { coverage: 1, missing: [] as string[] };
  let j = 0;
  let found = 0;
  const missing: string[] = [];
  for (const w of src) {
    // Look a little ahead: a spelled-out number or a fixed artefact may sit between.
    const k = out.indexOf(w, j);
    if (k >= 0 && k - j <= 12) {
      found++;
      j = k + 1;
    } else missing.push(w);
  }
  return { coverage: found / src.length, missing };
}

const CONTENTS =
  /^(table of contents|contents|mundarija|muna?ndarija|содержание|оглавление|мундарижа|fihrist|index)$/i;

/**
 * The PDF's own table of contents: the page with a "Contents" / "Mundarija"
 * line among the first pages, and the pages right after it that are still
 * lists of short lines. Bullets and dot leaders are kept for the AI to read.
 */
export function contentsLines(pages: { page: number; content: string }[]) {
  const first = pages
    .filter((p) => p.page <= 40)
    .find((p) =>
      p.content
        .split("\n")
        .slice(0, 12)
        .some((l) => CONTENTS.test(l.trim().replace(/[.:]+$/, ""))),
    );
  if (!first) return null;
  const out: { page: number; line: string }[] = [];
  for (const p of pages.filter((x) => x.page >= first.page && x.page <= first.page + 12)) {
    const lines = p.content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const short = lines.filter((l) => l.length <= 90).length;
    if (p !== first && (!lines.length || short < lines.length * 0.7)) break;
    for (const line of lines) out.push({ page: p.page, line });
    if (out.length > 800) break;
  }
  return { page: first.page, lines: out };
}

/**
 * Picture-only pages (maps, plates) have no text to read: the narrator says
 * their titles instead (e.g. "Maps" / "The North"), so the audiobook keeps
 * every part of the original in its place.
 */
export function withPictureTitles<P extends { page: number; content: string }>(
  pages: P[],
  pictures: { page: number; text: string }[] | undefined,
): P[] {
  if (!pictures?.length) return pages;
  const out = pages.filter((p) => !pictures.some((x) => x.page === p.page));
  for (const x of pictures) out.push({ ...(pages[0] ?? {}), page: x.page, content: x.text } as P);
  return out.sort((a, b) => a.page - b.page);
}

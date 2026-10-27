/**
 * PDF text comes as visual lines. For reading it is turned back into
 * paragraphs: lines are joined, words broken by a hyphen at a line end are
 * mended, and short lines that end a sentence (or blank lines) close a
 * paragraph. Short all-capital lines become headings. Pure; used by the reader.
 */
export type Para = { text: string; heading: boolean };

const END = /[.!?…:;»”"’)\]]$/;
const isHeadingLine = (l: string) => {
  const letters = l.replace(/[^\p{L}]/gu, "");
  return (
    l.length <= 70 &&
    letters.length >= 2 &&
    letters === letters.toLocaleUpperCase() &&
    /\p{Lu}/u.test(letters) &&
    l.split(/\s+/).length <= 8
  );
};

/** Lowercase letters and digits only: how repeated lines are compared. */
export const lineKey = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * `noise`: keys (lineKey) of lines repeated on many pages — running headers,
 * footers, "previous | contents | next" links — which are dropped.
 */
export function reflow(content: string, noise?: Set<string>): Para[] {
  const lines = content
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => !noise?.has(lineKey(l)));
  const long = lines
    .filter((l) => l.length > 25)
    .map((l) => l.length)
    .sort((a, b) => a - b);
  const typical = long.length ? long[Math.floor(long.length * 0.75)] : 60;
  const out: Para[] = [];
  let cur = "";
  let prevLen = 0;
  const close = () => {
    if (cur.trim()) out.push({ text: cur.trim(), heading: false });
    cur = "";
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) {
      close();
      continue;
    }
    if (/^\d{1,4}$/.test(l) && (i === 0 || i === lines.length - 1)) continue; // page number
    // A title stands alone: after a paragraph end or a short line.
    if (isHeadingLine(l) && (!cur || prevLen < typical * 0.8)) {
      close();
      out.push({ text: l, heading: true });
      prevLen = 0;
      continue;
    }
    // A new paragraph often starts with dialogue dashes or an indent marker.
    if (cur && /^[—–-]\s/.test(l)) close();
    if (cur.endsWith("-") && /^\p{Ll}/u.test(l) && /\p{L}-$/u.test(cur)) cur = cur.slice(0, -1) + l;
    else cur += (cur ? " " : "") + l;
    // A short line that ends a sentence closes the paragraph.
    if (END.test(l) && l.length < typical * 0.8) close();
    prevLen = l.length;
  }
  close();
  return out;
}

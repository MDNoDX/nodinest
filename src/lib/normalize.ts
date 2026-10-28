/**
 * Text normalisation shared by search, autocomplete and duplicate detection.
 * MUST stay in sync with the SQL function nodinest.nn_norm() (drizzle/0001).
 */
const APOSTROPHES = /[ʻʼ‘’`´ʹ']/g;
const APOSTROPHE_CHAR = new RegExp(`^${APOSTROPHES.source}$`);

/**
 * Lower case, the 2026 letters folded onto the old spelling (ş → sh, ç → ch,
 * ö → o, ğ → g) so both alphabets find each other, apostrophes removed.
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ş/g, "sh")
    .replace(/ç/g, "ch")
    .replace(/ö/g, "o")
    .replace(/ğ/g, "g")
    .replace(APOSTROPHES, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a query into safe search tokens (letters/digits only). */
export function searchTokens(query: string, max = 8): string[] {
  const norm = normalizeText(query);
  const tokens = norm
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return Array.from(new Set(tokens)).slice(0, max);
}

/**
 * Builds a prefix-matching tsquery string ("abc:* & def:*") from tokens.
 * Tokens are already restricted to letters/digits, so no tsquery syntax can
 * be injected; the value is still passed as a bind parameter.
 */
export function toPrefixTsQuery(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Normalised form used to detect duplicate titles/names: also drops
 * punctuation so "Sapiens: A Brief History" ≈ "sapiens a brief history".
 */
export function duplicateKey(input: string): string {
  return normalizeText(input)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTag(input: string): string {
  return duplicateKey(input).replace(/ /g, "-").slice(0, 48);
}

/** Strips separators from an ISBN and validates its checksum. */
export function parseIsbn(raw: string): { scheme: "isbn10" | "isbn13"; value: string } | null {
  const v = raw.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{13}$/.test(v)) {
    const sum = v
      .slice(0, 12)
      .split("")
      .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
    const check = (10 - (sum % 10)) % 10;
    return check === Number(v[12]) ? { scheme: "isbn13", value: v } : null;
  }
  if (/^\d{9}[\dX]$/.test(v)) {
    const sum = v.split("").reduce((acc, d, i) => acc + (d === "X" ? 10 : Number(d)) * (10 - i), 0);
    return sum % 11 === 0 ? { scheme: "isbn10", value: v } : null;
  }
  return null;
}

export type SnippetPart = { text: string; match: boolean };

/**
 * Returns a short excerpt of `text` around the first token match, split into
 * parts so the UI can highlight matches without injecting HTML.
 * Matching is apostrophe- and case-insensitive (same rules as search).
 */
export function makeSnippet(text: string, tokens: string[], radius = 80): SnippetPart[] {
  if (!text) return [];
  // Build a normalised string with an index map back into the original.
  const map: number[] = [];
  let norm = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (APOSTROPHE_CHAR.test(ch)) continue;
    const lower = ch.toLowerCase();
    for (const c of lower) {
      norm += c;
      map.push(i);
    }
  }
  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    if (!token) continue;
    let from = 0;
    while (true) {
      const idx = norm.indexOf(token, from);
      if (idx === -1) break;
      const startOk = idx === 0 || !/[\p{L}\p{N}]/u.test(norm[idx - 1]);
      if (startOk) ranges.push([map[idx], map[idx + token.length - 1] + 1]);
      from = idx + token.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const first = merged[0];
  const start = first ? Math.max(0, first[0] - radius) : 0;
  const end = first
    ? Math.min(text.length, first[1] + radius * 2)
    : Math.min(text.length, radius * 3);
  const parts: SnippetPart[] = [];
  if (start > 0) parts.push({ text: "…", match: false });
  let cursor = start;
  for (const [a, b] of merged) {
    if (b <= start || a >= end) continue;
    const s = Math.max(a, start);
    const e = Math.min(b, end);
    if (s > cursor) parts.push({ text: text.slice(cursor, s), match: false });
    parts.push({ text: text.slice(s, e), match: true });
    cursor = e;
  }
  if (cursor < end) parts.push({ text: text.slice(cursor, end), match: false });
  if (end < text.length) parts.push({ text: "…", match: false });
  return parts;
}

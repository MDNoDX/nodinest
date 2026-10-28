/**
 * Uzbek Latin (2026 alphabet: ö ğ ş ç; the old oʻ gʻ sh ch also work) →
 * Uzbek Cyrillic. Brand names, codes in capitals and foreign words stay in
 * Latin. Pure; used to build messages/uz-Cyrl.json and for content at runtime.
 */
import { mapMessage, toNewUz } from "./uz-latin";

const KEEP = new Set([
  "nodinote",
  "nodinest",
  "telegram",
  "google",
  "gemini",
  "youtube",
  "payme",
  "click",
  "premium",
  "markdown",
  "word",
  "pages",
  "obsidian",
  "notion",
  "spotify",
  "mutolaa",
  "mac",
  "macos",
  "iphone",
  "ipad",
  "android",
  "chrome",
  "safari",
  "edge",
  "launchpad",
  "dock",
  "finder",
  "vercel",
  "wikipedia",
  "goodreads",
  "amazon",
  "asaxiy",
  "apple",
  "books",
  "nodi",
  "username",
  "email",
  "gmail",
  "pwa",
  "open",
  "library",
  "isbn",
]);

const MAP: Record<string, string> = {
  a: "а",
  b: "б",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "ҳ",
  i: "и",
  j: "ж",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "қ",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  x: "х",
  y: "й",
  z: "з",
  ö: "ў",
  ğ: "ғ",
  ş: "ш",
  ç: "ч",
  "’": "ъ",
  ʼ: "ъ",
};
const PAIRS: Record<string, string> = { yo: "ё", yu: "ю", ya: "я", ye: "е" };

function word(w: string) {
  const plain = w.replace(/[’ʼ]/g, "");
  if (KEEP.has(plain.toLowerCase()) || /[cw]/i.test(w) || (w.length > 1 && w === w.toUpperCase()))
    return w;
  const lower = w.toLowerCase();
  let out = "";
  for (let i = 0; i < lower.length; i++) {
    const pair = lower.slice(i, i + 2);
    let c: string;
    let n = 1;
    if (PAIRS[pair]) {
      c = PAIRS[pair];
      n = 2;
    } else if (lower[i] === "e" && i === 0) c = "э";
    else c = MAP[lower[i]] ?? lower[i];
    out += w[i] !== lower[i] ? c.toUpperCase() : c;
    i += n - 1;
  }
  return out;
}

const WORD = /[A-Za-zöğşçÖĞŞÇ’ʼ]+/g;

/** Plain text. URLs, e-mails, @usernames and `code` stay as they are. */
export function toCyrillic(text: string): string {
  return toNewUz(text)
    .split(/(https?:\/\/\S+|\S+@\S+\.\S+|@\w+|`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(WORD, word)))
    .join("");
}

export const toCyrillicMessage = (msg: string) => mapMessage(msg, toCyrillic);

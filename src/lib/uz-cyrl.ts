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

const TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ғ: "gʻ",
  д: "d",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  қ: "q",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  ў: "oʻ",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ҳ: "h",
  ц: "s",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "ʼ",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Uzbek Cyrillic → the usual Latin (for speech: the voices read it far better). */
export function uzCyrillicToLatin(text: string): string {
  return text.replace(/[а-яёўқғҳ]/giu, (ch, at: number) => {
    const low = ch.toLowerCase();
    const prev = at > 0 ? text[at - 1] : "";
    // е is "ye" at the start of a word and after a vowel, else "e".
    const out =
      low === "е"
        ? !/[а-яёўқғҳ]/iu.test(prev) || /[аоуэиўеёюя]/iu.test(prev)
          ? "ye"
          : "e"
        : (TO_LATIN[low] ?? ch);
    return ch === low ? out : out.charAt(0).toUpperCase() + out.slice(1);
  });
}

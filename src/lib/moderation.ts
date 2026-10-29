/**
 * A first line against obscene and extremist text in what other people can
 * see (names, usernames, bios, the shared catalog). Text is folded first
 * (case, Cyrillic look-alikes, leetspeak, separators like "f.u.c.k"), then
 * matched against word roots. Long roots match inside words; short ones only
 * as whole words, so ordinary words are not caught. Not a full filter — the
 * AI has its own safety settings and rules.
 */

const LOOK: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "|": "i",
  "€": "e",
};

/** Lowercase, leetspeak → letters, Latin look-alikes in Cyrillic words. */
export function foldForModeration(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[0134579@$|€]/g, (c) => LOOK[c] ?? c)
    .replace(/ё/g, "е")
    .replace(/[ʻʼ’‘`']/g, "");
}

// Obscene roots (Russian mat, Uzbek and English profanity, porn).
const OBSCENE_ANY = [
  "хуй",
  "хуе",
  "хуи",
  "хуя",
  "пизд",
  "ебат",
  "ебан",
  "ебал",
  "ебу",
  "уеба",
  "заеб",
  "выеб",
  "бляд",
  "блят",
  "мудак",
  "мудил",
  "пидор",
  "пидар",
  "залуп",
  "шлюх",
  "манда",
  "гандон",
  "fuck",
  "fuk",
  "motherf",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "pussy",
  "porn",
  "pornhub",
  "xvideos",
  "xnxx",
  "onlyfans",
  "blowjob",
  "dalbayob",
  "dalbayop",
  "qotoq",
  "qanjiq",
  "jalab",
  "sikay",
  "sikaman",
  "sikish",
  "sikib",
  "sikdim",
  "ske",
  "skay",
  "amjalab",
  "далбаёб",
  "далбаеб",
  "қотоқ",
  "котоқ",
  "қанжиқ",
  "жалаб",
  "сикай",
  "сикиш",
  "сикаман",
];
const OBSCENE_WORD = [
  "сука",
  "сучка",
  "shit",
  "bitch",
  "whore",
  "slut",
  "xxx",
  "porno",
  "suka",
  "pizda",
  "blyat",
  "blya",
  "xuy",
  "huy",
];

// Banned extremist organisations, nazi slogans and calls to kill.
const EXTREMIST_ANY = [
  "hizbuttahrir",
  "hizbut-tahrir",
  "hizb ut-tahrir",
  "хизбутт",
  "хизб ут",
  "akromiy",
  "акромий",
  "daish",
  "даиш",
  "игил",
  "isis",
  "isil",
  "heilhitler",
  "heil hitler",
  "sieg heil",
  "siegheil",
  "whitepower",
  "white power",
  "1488",
  "kafirlarni öldir",
  "kafirlarni oldir",
  "кофирларни ўлдир",
  "убивать неверных",
  "смерть неверным",
  "jihodga chaqir",
  "джихад против",
  "terrorchi bolamiz",
];

const words = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** "obscene" | "extremist" when the text should not be shown to others, else null. */
export function moderationIssue(
  text: string | null | undefined,
  opts: { extremist?: boolean } = {},
): "obscene" | "extremist" | null {
  if (!text) return null;
  const f = foldForModeration(text);
  const squashed = f.replace(/[\s._\-*~+]+/g, "");
  const ws = new Set(words(f));
  if (OBSCENE_ANY.some((r) => r.length >= 4 && (f.includes(r) || squashed.includes(r))))
    return "obscene";
  if (OBSCENE_ANY.some((r) => r.length < 4 && ws.has(r))) return "obscene";
  if (OBSCENE_WORD.some((w) => ws.has(w))) return "obscene";
  if (opts.extremist === false) return null;
  const plain = text.toLowerCase();
  const plainSquashed = plain.replace(/[\s._\-*~+]+/g, "");
  const plainWords = new Set(words(plain));
  const hit = (r: string) => {
    if (r.length <= 5) return ws.has(r) || plainWords.has(r);
    const rs = r.replace(/[\s-]+/g, "");
    return (
      f.includes(r) || squashed.includes(rs) || plain.includes(r) || plainSquashed.includes(rs)
    );
  };
  if (EXTREMIST_ANY.some(hit)) return "extremist";
  return null;
}

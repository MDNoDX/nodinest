/**
 * Icons for plan items: colour pictures in public/plan-icons (Fluent Emoji, made
 * by scripts/make-plan-icons.mjs), so they work offline. Plus a guess from the
 * title, in any of the site's languages. No guess means no icon choice: `pin`.
 */
import { normalizeText } from "@/lib/normalize";

/** What the picker shows, the most used first (hearts are left out on purpose). */
export const PICKER_ICONS = [
  "mosque",
  "dua",
  "beads",
  "quran",
  "book",
  "books",
  "pen",
  "memo",
  "grad",
  "brain",
  "dumbbell",
  "run",
  "walk",
  "bike",
  "swim",
  "football",
  "yoga",
  "shower",
  "tooth",
  "sunrise",
  "sun",
  "moon",
  "alarm",
  "bed",
  "rest",
  "water",
  "food",
  "salad",
  "apple",
  "coffee",
  "pill",
  "doctor",
  "briefcase",
  "code",
  "calc",
  "flask",
  "target",
  "timer",
  "calendar",
  "languages",
  "globe",
  "sound",
  "mic",
  "headphones",
  "music",
  "video",
  "camera",
  "palette",
  "game",
  "users",
  "child",
  "phone",
  "chat",
  "home",
  "broom",
  "cart",
  "wallet",
  "coin",
  "gift",
  "car",
  "plane",
  "leaf",
  "sprout",
  "tree",
  "flower",
  "bulb",
  "sparkles",
  "star",
  "notebook",
  "pin",
];

/** Keys of items saved with the older line icons. */
const OLD: Record<string, string> = {
  activity: "run",
  footprints: "run",
  heartpulse: "doctor",
  chef: "food",
  bookmark: "books",
  laptop: "code",
  hand: "dua",
  heart: "star",
  waves: "water",
  check: "pin",
  brush: "palette",
  coins: "coin",
};

export const iconKey = (name: string | null) => {
  const k = name ? (OLD[name] ?? name) : "pin";
  return PICKER_ICONS.includes(k) ? k : "pin";
};

/** Matched on normalizeText(title): lower case, ş→sh ç→ch ö→o ğ→g, no apostrophes. */
const GUESS: [RegExp, string][] = [
  [
    /bomdod|peshin|\basr\b|shom|xufton|tahajjud|namoz|qazo|tahorat|prayer|salah|намаз|молитв/,
    "mosque",
  ],
  [/\bduo\b|\bdua\b|iltijo|дуа/, "dua"],
  [/zikr|tasbeh|salovat|зикр/, "beads"],
  [/quron|qur.?an|sura|tilovat|hadis|tafsir|коран|хадис/, "quran"],
  [/kitob yoz|write a book|написать книг|taqriz/, "pen"],
  [/kitob|oqi|\bbook|read|книг|чтен|читат/, "book"],
  [/dars|lesson|урок|kurs|course|universitet|maktab|imtihon|exam|учеб/, "grad"],
  [/futbol|football|soccer|футбол/, "football"],
  [/suzish|bassein|swim|плаван/, "swim"],
  [/velosiped|bike|cycling|велосип/, "bike"],
  [/yoga|meditatsiya|meditat|йога|медитац/, "yoga"],
  [/yugur|\brun|\bбег/, "run"],
  [/yurish|sayr|\bwalk|прогул|ходьб/, "walk"],
  [
    /badan|sport|mashq|mashg|shug|gym|workout|exercise|push.?up|turnik|спорт|зарядк|трениро|отжим/,
    "dumbbell",
  ],
  [/uygon|turish|wake|под.?[её]м/, "sunrise"],
  [/uxla|uyqu|sleep|\bсон\b|\bспать/, "bed"],
  [/\bdam\b|rest|отдых/, "rest"],
  [/tish|teeth|зуб/, "tooth"],
  [/yuvin|\bdush|shower|\bдуш/, "shower"],
  [/\btil\b|english|ingliz|ielts|arab|\brus\b|turk|language|язык/, "languages"],
  [/tahlil|kundalik|journal|итог|дневник/, "notebook"],
  [/maqola|yozish|\byoz|write|\bпис/, "memo"],
  [/takror|review|повтор|yodla/, "brain"],
  [/nonushta|tushlik|kechki ovqat|ovqat|\beat|meal|\bеда|завтрак|обед|ужин/, "food"],
  [/\bsuv\b|water|\bвод/, "water"],
  [/kod|dastur|\bcode|program|код/, "code"],
  [/ish\b|ishl|\bwork|работ|majlis|meeting|совещ|uchrashuv/, "briefcase"],
  [/oila|family|семь|\bota\b|\bona\b|ota.?ona/, "users"],
  [/farzand|bola|\bkid|ребен|дети/, "child"],
  [/qongiroq|telefon|\bcall|позвон/, "phone"],
  [/tozala|supur|\bclean|уборк/, "broom"],
  [/bozor|xarid|shop|покуп|магазин/, "cart"],
  [/sadaqa|ehson|hadya|gift|садак|подар/, "gift"],
  [/pul|xarajat|money|budget|деньг|бюджет/, "wallet"],
  [/dori|medicine|лекарств|таблет/, "pill"],
  [/shifokor|doctor|врач/, "doctor"],
  [/musiqa|music|музык/, "music"],
  [/podkast|podcast|audio|ovoz|tinglash|listen|слуша/, "headphones"],
  [/video|youtube|видео/, "video"],
  [/rasm|chizish|draw|рисов/, "palette"],
  [/sayohat|travel|путешеств/, "plane"],
  [/mashina|haydash|drive|машин/, "car"],
];

export type AddedIcon = { id: string; name: string; words: string };

/** The owner's icons go first: they were added for exactly these words. */
export function guessIcon(title: string, added: AddedIcon[] = []): string {
  const t = normalizeText(title);
  for (const a of added)
    for (const w of a.words.split(/[,\n]/).map((x) => normalizeText(x).trim()))
      if (w && t.includes(w)) return `c:${a.id}`;
  for (const [re, icon] of GUESS) if (re.test(t)) return icon;
  return "pin";
}

/** Measures offered when adding an item ("none" is a bare number, "full" has no number). */
export const UNITS = ["none", "page", "min", "hour", "piece", "rakat", "chapter", "full"] as const;
export type Unit = (typeof UNITS)[number];

export const GOAL_KINDS = [
  "study",
  "sport",
  "language",
  "faith",
  "work",
  "health",
  "money",
  "other",
] as const;
export const GOAL_ICON: Record<(typeof GOAL_KINDS)[number], string> = {
  study: "grad",
  sport: "dumbbell",
  language: "languages",
  faith: "dua",
  work: "briefcase",
  health: "doctor",
  money: "wallet",
  other: "target",
};

export const ALARM_SOUNDS = ["chime", "bell", "soft", "rise", "ping"] as const;
export type AlarmSound = (typeof ALARM_SOUNDS)[number];

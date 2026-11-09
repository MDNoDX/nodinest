/**
 * Icons for plan items: colour pictures in public/plan-icons (Fluent Emoji, made
 * by scripts/make-plan-icons.mjs), so they work offline. Plus a guess from the
 * title, in any of the site's languages. No guess means no icon choice: `pin`.
 */
import { normalizeText } from "@/lib/normalize";

/**
 * What the picker shows, the most used first (hearts are left out on purpose):
 * study, workout, writing, reading, prayer, dhikr. The owner can change the
 * order and every picture in Admin → Icons (`PlanIconsCfg`).
 */
export const PICKER_ICONS = [
  "grad",
  "dumbbell",
  "pen",
  "book",
  "mosque",
  "beads",
  "dua",
  "quran",
  "books",
  "memo",
  "notebook",
  "brain",
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

/** An icon the owner added; `img` is its picture (`/api/plan-icons/<img>`). */
export type AddedIcon = { id: string; name: string; words: string; img: string };

/** The owner's choices (app_settings "plan_icons"), the same for everyone. */
export type PlanIconsCfg = {
  custom: AddedIcon[];
  /** One of our icons with its picture replaced: key → picture id. */
  over: Record<string, string>;
  /** Words that pick one of our icons, besides the built-in guess. */
  words: Record<string, string>;
  /** The picker's order (our keys and "c:<id>"); null = ours. */
  order: string[] | null;
};
export const NO_ICONS: PlanIconsCfg = { custom: [], over: {}, words: {}, order: null };

/** Every icon the picker offers, in the owner's order; new ones of the owner first. */
export function pickerKeys(cfg: PlanIconsCfg): string[] {
  const own = cfg.custom.map((c) => `c:${c.id}`);
  const valid = new Set([...own, ...PICKER_ICONS]);
  const order = (cfg.order ?? PICKER_ICONS).filter((k) => valid.has(k));
  const seen = new Set(order);
  return [
    ...own.filter((k) => !seen.has(k)),
    ...order,
    ...PICKER_ICONS.filter((k) => !seen.has(k)),
  ];
}

/** Where a plan item's picture comes from. */
export function iconSrc(name: string | null, cfg: PlanIconsCfg = NO_ICONS): string {
  if (name?.startsWith("c:")) {
    const id = name.slice(2);
    const own = cfg.custom.find((c) => c.id === id);
    if (own) return `/api/plan-icons/${own.img}`;
    name = null; // removed by the owner: the plain pin
  }
  const k = iconKey(name);
  return cfg.over[k] ? `/api/plan-icons/${cfg.over[k]}` : `/plan-icons/${k}.svg`;
}

const words = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => normalizeText(x).trim())
    .filter(Boolean);

/** The owner's words go first (they were written for exactly this), then our guess. */
export function guessIcon(title: string, cfg: Partial<PlanIconsCfg> = {}): string {
  const t = normalizeText(title);
  for (const a of cfg.custom ?? [])
    if (words(a.words).some((w) => t.includes(w))) return `c:${a.id}`;
  for (const [k, w] of Object.entries(cfg.words ?? {}))
    if (PICKER_ICONS.includes(k) && words(w).some((x) => t.includes(x))) return k;
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

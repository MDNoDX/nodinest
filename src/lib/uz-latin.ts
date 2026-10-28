/**
 * Uzbek Latin → the alphabet of the 2026 law: Oʻ → Ö, Gʻ → Ğ, Sh → Ş, Ch → Ç
 * ("ng" is no longer a separate letter, so its spelling does not change; the
 * tutuq ’ stays). Words in other languages (Chrome, Shift…) are left alone.
 * Pure; used for the UI texts (scripts/uz-latin.ts) and Intl dates at runtime.
 */
const FOREIGN = new Set(
  [
    "chrome",
    "english",
    "launchpad",
    "shift",
    "chapter",
    "chapters",
    "cache",
    "push",
    "flash",
    "search",
    "shorts",
    "chatgpt",
    "microsoft",
    "chat",
    "sheets",
    "share",
    "shortcut",
    "shortcuts",
    "touch",
    "match",
    "launch",
    "rich",
    "dashboard",
    "fresh",
    "batch",
    "publish",
    "english",
    "flashcards",
    "flashcard",
    "speech",
    "school",
    "scholar",
    "chess",
    "march",
    "french",
  ].map((w) => w.toLowerCase()),
);

const WORD = /[A-Za-zÀ-ɏʻ‘’ʼ]+/g;

function word(w: string) {
  const base = w.replace(/[’ʼ].*$/, "");
  if (FOREIGN.has(base.toLowerCase())) return w;
  return w
    .replace(/O[‘ʻ]/g, "Ö")
    .replace(/o[‘ʻ]/g, "ö")
    .replace(/G[‘ʻ]/g, "Ğ")
    .replace(/g[‘ʻ]/g, "ğ")
    .replace(/S[hH]/g, "Ş")
    .replace(/sh/g, "ş")
    .replace(/C[hH]/g, "Ç")
    .replace(/ch/g, "ç");
}

/** Plain text (no markup). URLs, e-mails and `code` are kept as they are. */
export function toNewUz(text: string): string {
  return text
    .split(/(https?:\/\/\S+|\S+@\S+\.\S+|`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(WORD, word)))
    .join("");
}

/**
 * An ICU message (next-intl): only the text is converted, never argument
 * names, plural / select keywords or rich-text tag names.
 */
export function toNewUzMessage(msg: string): string {
  let out = "";
  let i = 0;
  const text = (stop: (c: string) => boolean) => {
    let buf = "";
    while (i < msg.length && !stop(msg[i])) {
      const c = msg[i];
      if (c === "<") {
        const j = msg.indexOf(">", i);
        out += toNewUz(buf) + msg.slice(i, j + 1);
        buf = "";
        i = j + 1;
        continue;
      }
      if (c === "{") {
        out += toNewUz(buf);
        buf = "";
        arg();
        continue;
      }
      buf += c;
      i++;
    }
    out += toNewUz(buf);
  };
  const arg = () => {
    // {name} | {name, type} | {name, plural|select|selectordinal, key {text} …}
    const start = i;
    let depth = 0;
    let j = i;
    for (; j < msg.length; j++) {
      if (msg[j] === "{") depth++;
      else if (msg[j] === "}" && --depth === 0) break;
    }
    const inner = msg.slice(start + 1, j);
    const m = /^\s*(\w+)\s*,\s*(plural|select|selectordinal)\s*,/.exec(inner);
    if (!m) {
      out += msg.slice(start, j + 1);
      i = j + 1;
      return;
    }
    out += "{" + m[0];
    i = start + 1 + m[0].length;
    while (i < j) {
      const c = msg[i];
      if (c === "{") {
        out += "{";
        i++;
        text((ch) => ch === "}");
        out += "}";
        i++;
      } else {
        out += c;
        i++;
      }
    }
    out += "}";
    i = j + 1;
  };
  text(() => false);
  return out;
}

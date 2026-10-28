/** Usernames: 3–30 of a–z, 0–9 and "_", starting with a letter (shared by form and server). */
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,29}$/;

export const normalizeUsername = (s: string) => s.trim().replace(/^@+/, "").toLowerCase();

const CYR: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ғ: "g",
  д: "d",
  е: "e",
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
  ў: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ҳ: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** A username-shaped version of a name: "Ögabek Şukurov" → "ogabek_shukurov". */
export function usernameBase(s: string) {
  const latin = s
    .toLowerCase()
    .replace(/[а-яёўқғҳ]/g, (c) => CYR[c] ?? "")
    .replace(/ş/g, "sh")
    .replace(/ç/g, "ch")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʻʼ`']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "");
  return latin.slice(0, 30).replace(/_+$/, "");
}

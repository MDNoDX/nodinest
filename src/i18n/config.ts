export const LOCALES = ["uz", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "uz";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Any value → one of our locales (Uzbek when unknown). */
export const asLocale = (v: unknown): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);

/** BCP 47 tag for Intl formatting. */
export const intlTag = (l: Locale) => (l === "uz" ? "uz-Latn-UZ" : l === "ru" ? "ru-RU" : "en-GB");

/**
 * The language AI answers are written in. Uzbek uses the Latin alphabet of
 * the 2026 law (Ö ö, Ğ ğ, Ş ş, Ç ç instead of Oʻ, Gʻ, Sh, Ch).
 */
export const aiLanguage = (l: Locale) =>
  l === "en"
    ? "English"
    : l === "ru"
      ? "Russian"
      : "Uzbek in the new Latin alphabet (2026 law): write ö, ğ, ş, ç instead of oʻ, gʻ, sh, ch (e.g. «özbek», «ğoya», «şahar», «çiroyli»)";

/** First choice from the browser's languages (first visit, no cookie yet). */
export function fromAcceptLanguage(header: string | null): Locale {
  for (const part of (header ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

/** A name in three languages where Russian may be missing (falls back to English). */
export const pickName = (l: Locale, n: { uz: string; ru?: string | null; en: string }) =>
  l === "uz" ? n.uz : l === "ru" ? n.ru || n.en : n.en;

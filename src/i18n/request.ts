import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { fromAcceptLanguage, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Locale comes from a cookie (no locale prefix in URLs), else the browser's
 * language; Uzbek (new Latin alphabet) is the default. User-generated content is never translated.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  // No choice yet: the browser's language (uz / ru / en), Uzbek otherwise.
  const locale = isLocale(fromCookie)
    ? fromCookie
    : fromAcceptLanguage((await headers()).get("accept-language"));
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Asia/Tashkent",
  };
});

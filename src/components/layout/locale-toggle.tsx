"use client";
import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/personal";
import { LOCALES } from "@/i18n/config";
import { cn } from "@/lib/cn";

const SHORT: Record<string, string> = { uz: "UZ", "uz-Cyrl": "ЎЗ", ru: "RU", en: "EN" };

/** One globe: each tap moves to the next language (O'zbek → Ўзбек → Русский → English). */
export function LocaleToggle() {
  const t = useTranslations("locale");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = LOCALES[(LOCALES.indexOf(locale as (typeof LOCALES)[number]) + 1) % LOCALES.length];
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t("label")}
      title={t("label")}
      onClick={() =>
        start(async () => {
          await setLocaleAction(next);
          router.refresh();
        })
      }
      className={cn(
        "text-muted hover:bg-surface-2 hover:text-foreground inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors",
        pending && "opacity-60",
      )}
    >
      <Globe className={cn("size-[18px]", pending && "animate-spin")} />
      {SHORT[locale] ?? locale}
    </button>
  );
}

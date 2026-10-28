"use client";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/personal";
import { cn } from "@/lib/cn";

const LANGS = [
  { code: "uz", label: "Özbekça", flag: "🇺🇿" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "en", label: "English", flag: "🇬🇧" },
] as const;

/** Three big buttons; the page switches language at once. */
export function LanguagePicker({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" className={cn("grid grid-cols-3 gap-2", className)}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={locale === l.code}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setLocaleAction(l.code);
              router.refresh();
            })
          }
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-medium transition-colors",
            locale === l.code
              ? "border-primary bg-primary-soft text-primary"
              : "border-border hover:bg-surface-2",
          )}
        >
          <span className="text-2xl" aria-hidden>
            {l.flag}
          </span>
          {l.label}
        </button>
      ))}
    </div>
  );
}

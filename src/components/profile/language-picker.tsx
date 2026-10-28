"use client";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/personal";
import { cn } from "@/lib/cn";

const LANGS = [
  { code: "uz", label: "Özbekça" },
  { code: "uz-Cyrl", label: "Ўзбекча" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
] as const;

/** Three big buttons; the page switches language at once. */
export function LanguagePicker({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
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
          <span
            aria-hidden
            className="bg-surface-2 grid size-9 place-items-center rounded-lg text-xs font-bold tracking-wide uppercase"
          >
            {l.code === "uz-Cyrl" ? "ЎЗ" : l.code}
          </span>
          {l.label}
        </button>
      ))}
    </div>
  );
}

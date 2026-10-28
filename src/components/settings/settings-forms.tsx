"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore, useTransition } from "react";
import { saveTimezoneAction, setLocaleAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";
import { LOCALES } from "@/i18n/config";

/** The time zone used for dates and "today" (the name lives in the profile form). */
export function TimezoneForm({
  timezone: initialTz,
  zones,
}: {
  timezone: string;
  zones: string[];
}) {
  const t = useTranslations();
  const [tz, setTz] = useState(initialTz);
  const { pending, exec } = useAction();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => saveTimezoneAction(tz), { success: t("settings.saved") });
      }}
    >
      <Field label={t("settings.timezone")} className="flex-1">
        {(p) => (
          <Select {...p} value={tz} onChange={(e) => setTz(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" variant="outline" loading={pending}>
        {t("common.save")}
      </Button>
    </form>
  );
}

export function AppearanceForm() {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  // true only on the client, avoiding a hydration mismatch for the theme.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [, start] = useTransition();
  const opts = [
    ["light", Sun],
    ["dark", Moon],
    ["system", Monitor],
  ] as const;
  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("theme.label")}</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {opts.map(([v, Icon]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={mounted && theme === v}
              onClick={() => setTheme(v)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm",
                mounted && theme === v
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-strong hover:bg-surface-2",
              )}
            >
              <Icon className="size-5" /> {t(`theme.${v}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("locale.label")}</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={locale === l}
              onClick={() =>
                start(async () => {
                  await setLocaleAction(l);
                  router.refresh();
                })
              }
              className={cn(
                "rounded-xl border p-3 text-sm",
                locale === l
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-strong hover:bg-surface-2",
              )}
            >
              {t(`locale.${l}`)}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

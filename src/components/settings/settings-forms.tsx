"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore, useTransition } from "react";
import { saveProfileAction, setLocaleAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";

export function ProfileForm({
  name: initialName,
  timezone: initialTz,
  zones,
}: {
  name: string;
  timezone: string;
  zones: string[];
}) {
  const t = useTranslations();
  const [name, setName] = useState(initialName);
  const [tz, setTz] = useState(initialTz);
  const { pending, exec } = useAction();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => saveProfileAction({ name, timezone: tz }), { success: t("settings.saved") });
      }}
    >
      <Field label={t("settings.name")}>
        {(p) => (
          <Input
            {...p}
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label={t("settings.timezone")} hint={t("settings.timezoneHint")}>
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
      <Button type="submit" loading={pending} className="self-start">
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
          {(["uz", "en"] as const).map((l) => (
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

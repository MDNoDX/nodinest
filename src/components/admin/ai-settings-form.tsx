"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveAiSettingsAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";

export function AiSettingsForm({
  initial,
  tools,
}: {
  initial: {
    enabled: boolean;
    dailyLimitPerUser: number;
    allowedTools: string[];
    pausedUntil: string | null;
  };
  tools: readonly string[];
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [v, setV] = useState(initial);
  const { pending, exec } = useAction();
  const paused = v.pausedUntil && new Date(v.pausedUntil) > new Date();
  return (
    <form
      className="card flex max-w-2xl flex-col gap-5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => saveAiSettingsAction(v), { success: t("aiSaved") });
      }}
    >
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-[var(--primary)]"
          checked={v.enabled}
          onChange={(e) => setV({ ...v, enabled: e.target.checked })}
        />
        {t("aiEnabled")}
      </label>
      <Field label={t("dailyLimit")}>
        {(p) => (
          <Input
            {...p}
            type="number"
            min={0}
            max={1000}
            className="w-32"
            value={v.dailyLimitPerUser}
            onChange={(e) => setV({ ...v, dailyLimitPerUser: Number(e.target.value) })}
          />
        )}
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("allowedTools")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {tools.map((tool) => (
            <label key={tool} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={v.allowedTools.includes(tool)}
                onChange={(e) =>
                  setV({
                    ...v,
                    allowedTools: e.target.checked
                      ? [...v.allowedTools, tool]
                      : v.allowedTools.filter((x) => x !== tool),
                  })
                }
              />
              {t(`toolNames.${tool}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {paused && (
        <div className="bg-warning-soft text-warning flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm">
          {t("pausedUntil", { time: new Date(v.pausedUntil!).toLocaleString() })}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setV({ ...v, pausedUntil: null })}
          >
            {t("clearPause")}
          </Button>
        </div>
      )}
      <Button type="submit" loading={pending} className="self-start">
        {tc("save")}
      </Button>
    </form>
  );
}

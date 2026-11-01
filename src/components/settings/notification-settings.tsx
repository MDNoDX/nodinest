"use client";
import { Send, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { botLinkAction, setNotifyPrefAction, unlinkBotAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { NotifyKey, NotifyPrefs } from "@/lib/notify-prefs";
import { useAction } from "@/lib/use-action";

const KEYS: NotifyKey[] = ["people", "plans", "goals", "news", "sound"];

/** Settings → Notifications: a switch per kind, and the Telegram bot. */
export function NotificationSettings({
  prefs,
  bot,
}: {
  prefs: NotifyPrefs;
  bot: { linked: boolean; name: string | null };
}) {
  const t = useTranslations("notifications");
  const te = useTranslations("errors");
  const [v, setV] = useState(prefs);
  const { exec, pending } = useAction();
  const [linking, startLink] = useTransition();
  const flip = (k: NotifyKey) => {
    const on = !v[k];
    setV((s) => ({ ...s, [k]: on }));
    void setNotifyPrefAction(k, on).then((r) => {
      if (!r.ok) {
        setV((s) => ({ ...s, [k]: !on }));
        toast.error(te(r.code as "VALIDATION"));
      }
    });
  };
  const row = (k: NotifyKey) => (
    <li key={k} className="flex items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t(`pref.${k}`)}</span>
        <span className="text-muted block text-xs">{t(`prefHint.${k}`)}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={v[k]}
        aria-label={t(`pref.${k}`)}
        onClick={() => flip(k)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          v[k] ? "bg-primary" : "bg-surface-2 ring-border-strong ring-1",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
            v[k] && "translate-x-5",
          )}
        />
      </button>
    </li>
  );
  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-border divide-y">{KEYS.map(row)}</ul>
      <section className="border-border rounded-2xl border p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#229ED9] text-white">
            <Send className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">{t("botTitle")}</h3>
            <p className="text-muted text-xs">
              {bot.linked ? t("botLinked", { name: bot.name ?? "" }) : t("botHint")}
            </p>
          </div>
          {bot.linked ? (
            <Button
              variant="ghost"
              size="sm"
              loading={pending}
              onClick={() => exec(() => unlinkBotAction())}
            >
              <Unlink /> {t("botUnlink")}
            </Button>
          ) : (
            <Button
              size="sm"
              loading={linking}
              onClick={() =>
                startLink(async () => {
                  const r = await botLinkAction();
                  if (r.ok) window.open(r.data, "_blank", "noopener");
                  else toast.error(te(r.code as "VALIDATION"));
                })
              }
            >
              <Send /> {t("botLink")}
            </Button>
          )}
        </div>
        {bot.linked && <ul className="mt-2">{row("telegram")}</ul>}
      </section>
    </div>
  );
}

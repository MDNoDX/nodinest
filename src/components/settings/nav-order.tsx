"use client";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { NAV_PRIMARY, NAV_SECONDARY, type NavItem } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { sortByOrder, useNavOrder, writeNavOrder } from "@/lib/nav-order";
import { usePhoneTabs, writePhoneTabs } from "@/lib/phone-tabs";

/**
 * Settings → the menu's order (up / down per section, per device). It is the
 * same order a drag in the menu saves, so either place shows the other's change.
 */
export function NavOrderSettings() {
  const t = useTranslations();
  const order = useNavOrder();
  const groups = [NAV_PRIMARY, NAV_SECONDARY.filter((i) => !i.admin)].map((g) =>
    sortByOrder(g, order),
  );
  const onBar = usePhoneTabs(groups.flat().map((i) => i.href));
  const move = (group: NavItem[], i: number, d: -1 | 1) => {
    const next = [...group];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    const all = groups.flatMap((g) => (g === group ? next : g)).map((x) => x.href);
    writeNavOrder(all);
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">{t("settings.navOrderHint")}</p>
      {groups.map((group, gi) => (
        <ol key={gi} className="border-border divide-border divide-y rounded-xl border">
          {group.map((item, i) => {
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Icon className="text-muted size-4" />
                <span className="min-w-0 flex-1 truncate">
                  {t(`nav.${item.key}` as "nav.dashboard")}
                </span>
                {/* On a phone this one sits on the bottom bar, not in the ☰ menu. */}
                {onBar.includes(item.href) && (
                  <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 text-[11px] md:hidden">
                    {t("settings.onBar")}
                  </span>
                )}
                <button
                  type="button"
                  className="text-muted hover:bg-surface-2 hover:text-foreground rounded-md p-1.5 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => move(group, i, -1)}
                  aria-label={t("settings.navUp")}
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  className="text-muted hover:bg-surface-2 hover:text-foreground rounded-md p-1.5 disabled:opacity-30"
                  disabled={i === group.length - 1}
                  onClick={() => move(group, i, 1)}
                  aria-label={t("settings.navDown")}
                >
                  <ArrowDown className="size-4" />
                </button>
              </li>
            );
          })}
        </ol>
      ))}
    </div>
  );
}

/** One press puts the whole menu back: its order and the phone's bottom bar. */
export function MenuReset() {
  const t = useTranslations("settings");
  return (
    <Button
      variant="outline"
      className="self-start"
      onClick={() => {
        writeNavOrder(null);
        writePhoneTabs(null);
      }}
    >
      <RotateCcw /> {t("menuReset")}
    </Button>
  );
}

"use client";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { NAV_PRIMARY, NAV_SECONDARY, type NavItem } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { sortByOrder, useNavOrder, writeNavOrder } from "@/lib/nav-order";

/** Settings → the side menu's order (up / down per section, per device). */
export function NavOrderSettings() {
  const t = useTranslations();
  const order = useNavOrder();
  const groups = [NAV_PRIMARY, NAV_SECONDARY.filter((i) => !i.admin)].map((g) =>
    sortByOrder(g, order),
  );
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
                <span className="flex-1">{t(`nav.${item.key}` as "nav.dashboard")}</span>
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
      {order.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => writeNavOrder(null)}
        >
          <RotateCcw /> {t("settings.navReset")}
        </Button>
      )}
    </div>
  );
}

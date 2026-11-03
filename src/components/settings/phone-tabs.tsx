"use client";
import { ArrowDown, ArrowUp, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { NAV_PRIMARY, NAV_SECONDARY } from "@/components/layout/nav-items";
import { cn } from "@/lib/cn";
import { sortByOrder, useNavOrder } from "@/lib/nav-order";
import { MAX_PHONE_TABS, usePhoneTabs, writePhoneTabs } from "@/lib/phone-tabs";

/**
 * Settings → the phone's bottom bar: which sections sit there (up to five,
 * icons only) and in what order. What is at the bottom is not in the ☰ menu.
 */
export function PhoneTabsSettings({ admin }: { admin: boolean }) {
  const t = useTranslations();
  // The menu's own order, so the list below reads like the ☰ menu.
  const order = useNavOrder();
  const all = [...sortByOrder(NAV_PRIMARY, order), ...sortByOrder(NAV_SECONDARY, order)].filter(
    (i) => !i.admin || admin,
  );
  const chosen = usePhoneTabs(all.map((i) => i.href));
  const full = chosen.length >= MAX_PHONE_TABS;
  const set = (next: string[]) => writePhoneTabs(next);
  const move = (i: number, d: -1 | 1) => {
    const next = [...chosen];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  const label = (key: string) => t(`nav.${key}` as "nav.dashboard");
  const byHref = (h: string) => all.find((i) => i.href === h)!;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">{t("settings.phoneTabsHint", { n: MAX_PHONE_TABS })}</p>
      {/* What the bar looks like now. */}
      <div className="bg-surface-2 mx-auto flex w-full max-w-sm items-center justify-around rounded-2xl p-2">
        {chosen.map((h) => {
          const it = byHref(h);
          const Icon = it.icon;
          return (
            <span key={h} className="text-primary flex flex-col items-center gap-0.5 text-[11px]">
              <Icon className="size-5" />
              <span className="max-w-16 truncate">{label(it.key)}</span>
            </span>
          );
        })}
      </div>
      <ol className="border-border divide-border divide-y rounded-xl border">
        {chosen.map((h, i) => {
          const it = byHref(h);
          const Icon = it.icon;
          return (
            <li key={h} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Icon className="text-primary size-4" />
              <span className="flex-1 font-medium">{label(it.key)}</span>
              <IconBtn label={t("settings.navUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="size-4" />
              </IconBtn>
              <IconBtn
                label={t("settings.navDown")}
                disabled={i === chosen.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="size-4" />
              </IconBtn>
              <IconBtn
                label={t("settings.phoneTabsRemove")}
                disabled={chosen.length <= 1}
                onClick={() => set(chosen.filter((x) => x !== h))}
              >
                <Minus className="size-4" />
              </IconBtn>
            </li>
          );
        })}
      </ol>
      <div>
        <p className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
          {t("settings.phoneTabsMenu")}
        </p>
        <ul className="border-border divide-border divide-y rounded-xl border">
          {all
            .filter((i) => !chosen.includes(i.href))
            .map((it) => {
              const Icon = it.icon;
              return (
                <li key={it.href} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Icon className="text-muted size-4" />
                  <span className="flex-1">{label(it.key)}</span>
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => set([...chosen, it.href])}
                    title={full ? t("settings.phoneTabsFull", { n: MAX_PHONE_TABS }) : undefined}
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors",
                      full
                        ? "text-muted opacity-50"
                        : "bg-primary-soft text-primary hover:bg-primary hover:text-primary-foreground",
                    )}
                  >
                    <Plus className="size-3.5" /> {t("settings.phoneTabsAdd")}
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="text-muted hover:bg-surface-2 hover:text-foreground rounded-md p-1.5 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

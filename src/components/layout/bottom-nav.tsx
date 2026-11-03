"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { NavItem } from "./nav-items";

/** Pages that need the whole screen for the text (the bar would cover it). */
export const IMMERSIVE_RE =
  /^\/(library\/[^/]+\/(read|taqriz)|write\/[^/]+|chats\/[^/]+|u\/[^/]+\/item\/[^/]+\/read)/;

/** The bottom bar's own badges and the short names that fit there. */
const SHORT: Record<string, string> = {
  dashboard: "home",
  notes: "notesShort",
  assistant: "ai",
};

/**
 * Phones: up to five sections the person chose (Settings → Menu), icons only —
 * their names are in the ☰ menu at the top. Big targets, where the thumb is.
 */
export function BottomNav({
  pathname,
  items,
  chats = 0,
}: {
  pathname: string;
  /** The chosen sections, in order. */
  items: NavItem[];
  chats?: number;
}) {
  const t = useTranslations("nav");
  const hit = (item: NavItem) => {
    const one = (h: string) =>
      h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`);
    return one(item.href) || (item.includes ?? []).some(one);
  };
  return (
    <nav
      aria-label={t("main")}
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul
        className="mx-auto grid h-14 max-w-lg"
        style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const on = hit(item);
          const Icon = item.icon;
          const name = t(SHORT[item.key] ?? item.key);
          return (
            <li key={item.href}>
              <Link
                href={item.to ?? item.href}
                aria-current={on ? "page" : undefined}
                aria-label={name}
                data-tour={`nav-${item.key}`}
                className={cn(
                  "flex h-full items-center justify-center transition-colors",
                  on ? "text-primary" : "text-muted active:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative grid h-10 w-14 place-items-center rounded-2xl transition-colors",
                    on && "bg-primary-soft",
                  )}
                >
                  <Icon className="size-6" strokeWidth={on ? 2.2 : 1.8} />
                  {item.key === "chats" && chats > 0 && (
                    <span className="bg-primary text-primary-foreground absolute top-0 right-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold tabular-nums">
                      {chats > 99 ? "99+" : chats}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

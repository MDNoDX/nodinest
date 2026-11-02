"use client";
import { Menu } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { NavItem } from "./nav-items";

/** Pages that need the whole screen for the text (the bar would cover it). */
export const IMMERSIVE_RE =
  /^\/(library\/[^/]+\/(read|taqriz)|write\/[^/]+|chats\/[^/]+|u\/[^/]+\/item\/[^/]+\/read)/;

/** The bottom bar's own badges and the short names that fit there. */
const SHORT: Record<string, string> = { notes: "notesShort", assistant: "ai" };

/**
 * Phones: up to four sections the person chose (Settings → Menu; profile,
 * Darsxona, Media and Chats by default) and "Menu" for the rest. There is no
 * menu button on top: everything is where the thumb is.
 */
export function BottomNav({
  pathname,
  items,
  onMenu,
  menuOpen,
  chats = 0,
  badge = 0,
}: {
  pathname: string;
  /** The chosen sections, in order. */
  items: NavItem[];
  onMenu: () => void;
  menuOpen: boolean;
  chats?: number;
  /** Something waits inside the menu (the admin's inbox). */
  badge?: number;
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
        className="mx-auto grid h-16 max-w-lg"
        style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const on = !menuOpen && hit(item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.to ?? item.href}
                aria-current={on ? "page" : undefined}
                data-tour={`nav-${item.key}`}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  on ? "text-primary" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "relative grid h-7 w-12 place-items-center rounded-full transition-colors",
                    on && "bg-primary-soft",
                  )}
                >
                  <Icon className="size-5" />
                  {item.key === "chats" && chats > 0 && (
                    <span className="bg-primary text-primary-foreground absolute -top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold tabular-nums">
                      {chats > 99 ? "99+" : chats}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-0.5">{t(SHORT[item.key] ?? item.key)}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMenu}
            aria-expanded={menuOpen}
            data-tour="nav-more"
            className={cn(
              "relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
              menuOpen ? "text-primary" : "text-muted",
            )}
          >
            <span
              className={cn(
                "relative grid h-7 w-12 place-items-center rounded-full transition-colors",
                menuOpen && "bg-primary-soft",
              )}
            >
              <Menu className="size-5" />
              {badge > 0 && (
                <span className="bg-accent absolute top-0.5 right-2.5 size-2 rounded-full" />
              )}
            </span>
            {t("more")}
          </button>
        </li>
      </ul>
    </nav>
  );
}

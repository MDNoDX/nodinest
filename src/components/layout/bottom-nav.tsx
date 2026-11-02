"use client";
import { BookOpen, CalendarCheck, Clapperboard, Home, Menu, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/** Pages that need the whole screen for the text (the bar would cover it). */
export const IMMERSIVE_RE =
  /^\/(library\/[^/]+\/(read|taqriz)|write\/[^/]+|chats\/[^/]+|u\/[^/]+\/item\/[^/]+\/read)/;

const TABS = [
  { href: "/", key: "dashboard", icon: Home, also: [] as string[] },
  { href: "/plans", key: "plans", icon: CalendarCheck, also: [] },
  {
    href: "/library",
    key: "library",
    icon: BookOpen,
    also: ["/people", "/publishers", "/notes", "/collections"],
  },
  { href: "/media", key: "media", icon: Clapperboard, also: [] },
  { href: "/chats", key: "chats", icon: MessageCircle, also: [] },
];

const SHORT: Record<string, string> = { dashboard: "home", notes: "notesShort", assistant: "ai" };

/**
 * Phones: the main sections one tap away at the bottom (where the thumb is),
 * and "Menu" for everything else (the AI is on the home page and in the menu).
 */
export function BottomNav({
  pathname,
  onMenu,
  badge,
  chats = 0,
}: {
  pathname: string;
  onMenu: () => void;
  badge?: number;
  /** Conversations with something unread. */
  chats?: number;
}) {
  const t = useTranslations("nav");
  const hit = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav
      aria-label={t("main")}
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-6">
        {TABS.map(({ href, key, icon: Icon, also }) => {
          const on = hit(href) || also.some(hit);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                data-tour={`nav-${key}`}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  on ? "text-primary" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "relative grid h-7 w-11 place-items-center rounded-full transition-colors",
                    on && "bg-primary-soft",
                  )}
                >
                  <Icon className="size-5" />
                  {key === "chats" && chats > 0 && (
                    <span className="bg-primary text-primary-foreground absolute -top-1 right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold">
                      {chats > 99 ? "99+" : chats}
                    </span>
                  )}
                </span>
                {t(SHORT[key] ?? key)}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMenu}
            data-tour="nav-more"
            className="text-muted relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
          >
            <span className="grid h-7 w-12 place-items-center rounded-full">
              <Menu className="size-5" />
            </span>
            {t("more")}
            {!!badge && (
              <span className="bg-accent absolute top-2.5 right-[calc(50%-18px)] size-2 rounded-full" />
            )}
          </button>
        </li>
      </ul>
    </nav>
  );
}

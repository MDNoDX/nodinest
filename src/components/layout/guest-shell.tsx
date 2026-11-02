"use client";
import { BookOpenText, Clapperboard, LifeBuoy, LogIn, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./theme-toggle";

const WIDE = /^\/media(\/|$)/;

/** Where "open a profile" leads, coming back to the page they were on. */
const joinHref = (path: string) => `/login?next=${encodeURIComponent(path)}`;

/**
 * The site for someone who has not signed in: what is public (Media, public
 * profiles and posts, the guide), and everywhere a way to open a profile.
 */
export function GuestShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("guest");
  const pathname = usePathname();
  const items = [
    { href: "/media", label: t("media"), icon: Clapperboard },
    { href: "/guide", label: t("guide"), icon: LifeBuoy },
  ];
  const hit = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  return (
    <div className="flex min-h-dvh">
      <aside className="border-border bg-surface/60 sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r p-3 lg:flex">
        <Link href="/media" className="mb-3 flex h-10 items-center px-1" aria-label="Röznoma">
          <Logo />
        </Link>
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={hit(href) ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-xl px-2 text-sm font-medium transition-colors",
              hit(href)
                ? "bg-primary-soft text-foreground"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon className="size-[18px]" /> {label}
          </Link>
        ))}
        <JoinCard compact className="mt-auto" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background/85 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-5">
          <Link href="/media" className="lg:hidden" aria-label="Röznoma">
            <Logo compact />
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              href={joinHref(pathname)}
              className="text-muted hover:text-foreground hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium sm:inline-flex"
            >
              <LogIn className="size-4" /> {t("signIn")}
            </Link>
            <Link
              href={joinHref(pathname)}
              className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
            >
              <UserRoundPlus className="size-4" /> {t("join")}
            </Link>
          </div>
        </header>
        <main
          id="main"
          className={cn(
            "mx-auto w-full flex-1 px-4 py-6 max-lg:pb-24 sm:px-6 sm:py-8",
            WIDE.test(pathname) ? "max-w-none" : "max-w-6xl",
          )}
        >
          {children}
        </main>
      </div>
      <nav className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-3">
          {[...items, { href: joinHref(pathname), label: t("profile"), icon: UserRoundPlus }].map(
            ({ href, label, icon: Icon }) => (
              <li key={label}>
                <Link
                  href={href}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                    hit(href) ? "text-primary" : "text-muted",
                  )}
                >
                  <Icon className="size-5" /> {label}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
    </div>
  );
}

/** "Open a profile": what one gets with it, and the button. */
export function JoinCard({ compact, className }: { compact?: boolean; className?: string }) {
  const t = useTranslations("guest");
  const pathname = usePathname();
  return (
    <div
      className={cn(
        "border-primary/30 bg-primary-soft flex flex-col gap-3 rounded-2xl border",
        compact ? "p-3" : "mx-auto max-w-md items-center p-6 text-center",
        className,
      )}
    >
      {!compact && (
        <span className="bg-primary text-primary-foreground grid size-12 place-items-center rounded-2xl">
          <BookOpenText className="size-6" />
        </span>
      )}
      <div>
        <p className={cn("font-semibold", !compact && "text-lg")}>{t("joinTitle")}</p>
        <p className="text-muted mt-1 text-xs leading-relaxed">{t("joinBody")}</p>
      </div>
      <Link
        href={joinHref(pathname)}
        className="bg-primary text-primary-foreground inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold"
      >
        <UserRoundPlus className="size-4" /> {t("join")}
      </Link>
    </div>
  );
}

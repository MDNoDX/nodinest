"use client";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Logo } from "@/components/brand/logo";
import { MediaDockProvider } from "@/components/media/media-dock";
import { OnboardingTour } from "@/components/onboarding/tour";
import { AlarmWatcher } from "@/components/roznoma/alarm-watcher";
import { cn } from "@/lib/cn";
import { SECTION_HUE, hueStyle } from "@/lib/hues";
import { BottomNav, IMMERSIVE_RE } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { sortByOrder, useNavOrder, writeNavOrder } from "@/lib/nav-order";
import { useDragOrder } from "@/lib/use-drag-order";
import { NAV_PRIMARY, NAV_SECONDARY, type NavItem } from "./nav-items";
import { UserMenu } from "./user-menu";

const SIDEBAR_KEY = "nodinest-sidebar";
function readSidebar() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}
function writeSidebar(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("nodinest-sidebar"));
}
function subscribeSidebar(cb: () => void) {
  window.addEventListener("nodinest-sidebar", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("nodinest-sidebar", cb);
    window.removeEventListener("storage", cb);
  };
}

const WIDE_RE = /^\/library\/[^/]+\/taqriz/;

type ShellUser = {
  name: string;
  email: string;
  image: string | null;
  role: "user" | "superadmin";
  /** Sees the admin section (the superadmin in admin mode, or an admin). */
  admin?: boolean;
  username?: string | null;
  premium?: boolean;
};

function isActive(pathname: string, item: NavItem) {
  const hit = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return hit(item.href) || (item.includes ?? []).some(hit);
}

function NavList({
  items,
  collapsed,
  pathname,
  onNavigate,
  badge,
  onReorder,
}: {
  items: NavItem[];
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
  badge?: Record<string, number>;
  /** The group's new order (hrefs) after a drag. */
  onReorder?: (hrefs: string[]) => void;
}) {
  const t = useTranslations("nav");
  const { list, shown, drag, start, swallowClick, dragged } = useDragOrder(
    items,
    (i) => i.href,
    onReorder,
  );
  return (
    <ul ref={list} className={cn("flex flex-col gap-0.5", drag && "select-none")}>
      {shown.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        const count = badge?.[item.key];
        return (
          <li
            key={item.href}
            onPointerDown={(e) => start(e, items.indexOf(item))}
            className={cn(
              "rounded-xl transition-transform",
              dragged === item.href && "bg-surface-2 ring-primary/40 scale-[1.03] shadow-lg ring-2",
            )}
          >
            <Link
              href={item.href}
              draggable={false}
              onContextMenu={(e) => drag && e.preventDefault()}
              onClick={(e) => {
                if (swallowClick.current) {
                  e.preventDefault();
                  return;
                }
                onNavigate?.();
              }}
              aria-current={active ? "page" : undefined}
              title={collapsed ? t(item.key) : undefined}
              data-tour={`nav-${item.key}`}
              style={hueStyle(SECTION_HUE[item.key] ?? "indigo")}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-xl px-2 text-sm font-medium transition-colors",
                active
                  ? "hue-soft text-foreground shadow-sm"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {active && !collapsed && (
                <span
                  aria-hidden
                  className="hue-bar absolute top-2 bottom-2 -left-2 w-1 rounded-r-full"
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-lg transition-colors",
                  // Each section keeps its own colour; brighter when active or hovered.
                  active ? "chip" : "text-[var(--hue)] opacity-75 group-hover:opacity-100",
                )}
              >
                <Icon className="size-[17px]" />
              </span>
              <span className={cn("truncate", collapsed && "sr-only")}>{t(item.key)}</span>
              {!!count && !collapsed && (
                <span className="bg-accent-soft text-accent ml-auto rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
                  {count}
                </span>
              )}
              {!!count && collapsed && (
                <span className="bg-accent absolute top-1.5 right-1.5 size-1.5 rounded-full" />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({
  user,
  pendingSuggestions,
  timerSlot,
  aiDailyLimit,
  sideAd,
  children,
}: {
  /** An ad card at the bottom of the side menu (free plan), or null. */
  sideAd?: React.ReactNode;
  /** Daily AI requests for this account; null = unlimited (superadmin). */
  aiDailyLimit: number | null;
  user: ShellUser;
  pendingSuggestions: number;
  timerSlot: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebar, () => false);
  // The drawer remembers the path it was opened on, so navigating closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const mobileOpen = openedOn === pathname;
  const setMobileOpen = (open: boolean) => setOpenedOn(open ? pathname : null);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggle = () => writeSidebar(!collapsed);

  // Phones: room for the bottom bar (the page end and the player sit above it).
  // On the root, so the player (rendered outside this tree) sees it too.
  const immersive = IMMERSIVE_RE.test(pathname);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--bottom-nav",
      immersive ? "0px" : "calc(4rem + env(safe-area-inset-bottom))",
    );
  }, [immersive]);

  const order = useNavOrder();
  // Both groups are saved together (each keeps its own items).
  const reorder = (a: string[] | NavItem[], b: string[] | NavItem[]) =>
    writeNavOrder([...a, ...b].map((x) => (typeof x === "string" ? x : x.href)));
  const primary = sortByOrder(NAV_PRIMARY, order);
  const secondary = sortByOrder(
    NAV_SECONDARY.filter((i) => !i.admin || user.admin),
    order,
  );
  const badge = { suggestions: pendingSuggestions };

  const sidebar = (mobile: boolean) => (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-14 items-center gap-2 px-3",
          collapsed && !mobile && "justify-center px-0",
        )}
      >
        <Link href="/" className="rounded-md" aria-label="NodiNote">
          <Logo compact={collapsed && !mobile} />
        </Link>
        {mobile && (
          <button
            className="text-muted hover:bg-surface-2 ml-auto rounded-md p-2"
            onClick={() => setMobileOpen(false)}
            aria-label={t("closeMenu")}
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      <nav aria-label={t("main")} className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
        <NavList
          items={primary}
          collapsed={collapsed && !mobile}
          pathname={pathname}
          onReorder={(h) => reorder(h, secondary)}
        />
        <div className="border-border mx-2 border-t" />
        <NavList
          items={secondary}
          collapsed={collapsed && !mobile}
          pathname={pathname}
          badge={badge}
          onReorder={(h) => reorder(primary, h)}
        />
        {sideAd && !collapsed && !mobile && <div className="mt-auto px-1 pb-1">{sideAd}</div>}
      </nav>
      {!mobile && (
        <div className={cn("border-border border-t p-2", collapsed && "flex justify-center")}>
          <button
            onClick={toggle}
            className="text-muted hover:bg-surface-2 hover:text-foreground flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm"
            aria-label={collapsed ? t("expand") : t("collapse")}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="mx-auto size-[18px]" />
            ) : (
              <PanelLeftClose className="size-[18px]" />
            )}
            {!collapsed && <span>{t("collapse")}</span>}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <MediaDockProvider>
      <div className="flex min-h-dvh">
        <a
          href="#main"
          className="bg-surface sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {tc("skipToContent")}
        </a>
        <aside
          className={cn(
            "border-border bg-surface/70 sticky top-0 hidden h-dvh shrink-0 border-r backdrop-blur-xl transition-[width] duration-200 lg:block",
            collapsed ? "w-[64px]" : "w-[248px]",
          )}
        >
          {sidebar(false)}
        </aside>

        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t("main")}
          >
            <div
              className="animate-fade-in absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <div className="border-border bg-surface animate-slide-up absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r shadow-2xl">
              {sidebar(true)}
            </div>
          </div>
        )}

        {/* --ai-panel: width of a side panel docked at the right edge (taqriz AI). */}
        <div className="flex min-w-0 flex-1 flex-col lg:pr-[var(--ai-panel,0px)]">
          <header className="border-border bg-background/85 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-5">
            <button
              className="text-muted hover:bg-surface-2 rounded-md p-2 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label={t("openMenu")}
              aria-expanded={mobileOpen}
            >
              <Menu className="size-5" />
            </button>
            <Link href="/" className="lg:hidden" aria-label="NodiNote">
              <Logo compact />
            </Link>
            <CommandPalette />
            <div className="ml-auto flex items-center gap-1.5">
              {timerSlot}
              <UserMenu user={user} />
            </div>
          </header>
          <main
            id="main"
            className={cn(
              "page-enter mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-8",
              "max-lg:pb-[calc(var(--bottom-nav,0px)+1.5rem)]",
              // Writing pages use the whole width (their panels hug the edges).
              WIDE_RE.test(pathname) ? "max-w-none" : "max-w-6xl",
            )}
          >
            {children}
          </main>
        </div>
        {!immersive && (
          <BottomNav
            pathname={pathname}
            onMenu={() => setMobileOpen(true)}
            badge={pendingSuggestions}
          />
        )}
        <OnboardingTour aiLimit={aiDailyLimit} />
        <AlarmWatcher />
      </div>
    </MediaDockProvider>
  );
}

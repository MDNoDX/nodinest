"use client";
import { comboLabel, getShortcuts, matches, useIsApple, useShortcuts } from "@/lib/shortcuts";
import {
  AtSign,
  BookOpen,
  BookText,
  FileText,
  GraduationCap,
  Hash,
  Headphones,
  PenLine,
  Play,
  Quote,
  Search,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Dialog as D } from "radix-ui";
import { PremiumBadge } from "@/components/premium/premium-badge";
import { Cover, coverSrc } from "@/components/library/cover";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/hooks";

type Hit = {
  group: string;
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
  kind: string | null;
  /** Users: a Premium account and the picture. */
  premium?: boolean;
  image?: string | null;
  /** Posts: the cover. */
  coverUrl?: string | null;
  coverFileId?: string | null;
};

/** Where the search looks: everything, my Darsxona, people, or one kind of post. */
const SCOPES = ["all", "library", "people"] as const;
type Scope = (typeof SCOPES)[number] | "media";
const KINDS = [
  ["book", BookOpen],
  ["video", Play],
  ["podcast", Headphones],
  ["course", GraduationCap],
  ["document", FileText],
] as const;
type Kind = (typeof KINDS)[number][0];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  users: AtSign,
  resources: BookOpen,
  people: User,
  quotes: Quote,
  notes: FileText,
  booktext: BookText,
  taqriz: PenLine,
  categories: Hash,
  media: Play,
};

export function CommandPalette() {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const keys = useShortcuts();
  const apple = useIsApple();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [kind, setKind] = useState<Kind | null>(null);
  const [items, setItems] = useState<Hit[]>([]);
  const [loadedFor, setLoadedFor] = useState("");
  const [active, setActive] = useState(0);
  const debounced = useDebounced(q, 180);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matches(e, getShortcuts().search)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // What is asked for: the words plus where to look (a kind alone lists its newest posts).
  const ask = `${scope}|${kind ?? ""}|${debounced.trim()}`;
  const asking = !!debounced.trim() || (scope === "media" && !!kind);
  useEffect(() => {
    if (!asking) return;
    const ctrl = new AbortController();
    const u = new URLSearchParams({ q: debounced, scope });
    if (kind) u.set("kind", kind);
    fetch(`/api/search/quick?${u}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: Hit[] }) => {
        setItems(d.items);
        setActive(0);
        setLoadedFor(ask);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [ask, asking, debounced, scope, kind]);

  const typed = !!q.trim();
  const shows = typed || (scope === "media" && !!kind);
  const loading = shows && (q !== debounced || ask !== loadedFor);
  const pickScope = (x: Scope, k: Kind | null = null) => {
    setScope(x);
    setKind(k);
    setActive(0);
  };
  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const hits = shows && loadedFor === ask ? items : [];
  // The full search page covers my own things, so it is offered for those.
  const all: Hit[] =
    typed && (scope === "all" || scope === "library")
      ? [
          ...hits,
          {
            group: "all",
            id: "all",
            href: `/search?q=${encodeURIComponent(q)}`,
            title: t("search.showAllMine"),
            subtitle: q,
            kind: null,
          },
        ]
      : hits;

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <button
          className="border-border bg-surface text-muted hover:border-border-strong flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-sm transition-colors"
          aria-label={t("nav.commandPalette")}
          data-tour="search"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">{t("search.title")}</span>
          <kbd className="border-border ml-auto hidden rounded border px-1.5 text-[10px] font-medium sm:inline">
            {comboLabel(keys.search, apple)}
          </kbd>
        </button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <D.Content className="border-border bg-surface animate-scale-in fixed top-[12vh] left-1/2 z-50 w-[min(56rem,94vw)] -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl">
          <D.Title className="sr-only">{t("nav.commandPalette")}</D.Title>
          <D.Description className="sr-only">{t("nav.commandHint")}</D.Description>
          <div className="border-border flex items-center gap-2 border-b px-4">
            <Search className="text-muted size-4" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, all.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && all.length) {
                  e.preventDefault();
                  go(all[active]?.href ?? all[all.length - 1].href);
                }
              }}
              placeholder={t(`search.palette.${scope === "media" ? "media" : scope}`)}
              className="h-12 flex-1 bg-transparent text-sm outline-none"
              role="combobox"
              aria-expanded={items.length > 0}
              aria-controls="cmdk-list"
              aria-activedescendant={all.length ? `cmdk-${active}` : undefined}
              aria-autocomplete="list"
            />
            {loading && (
              <span
                className="border-muted size-3.5 animate-spin rounded-full border-2 border-r-transparent"
                aria-hidden
              />
            )}
          </div>
          {/* Where to look, like Telegram's search: tabs, then the kinds of posts as icons. */}
          <div
            role="tablist"
            aria-label={t("search.title")}
            className="border-border flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5"
          >
            {SCOPES.map((x) => (
              <button
                key={x}
                type="button"
                role="tab"
                aria-selected={scope === x}
                onClick={() => pickScope(x)}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3 text-sm font-medium transition-colors",
                  scope === x
                    ? "bg-primary-soft text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {t(`search.scope.${x}`)}
              </button>
            ))}
            <span aria-hidden className="bg-border mx-1 h-5 w-px shrink-0" />
            {KINDS.map(([k, Icon]) => {
              const on = scope === "media" && kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={t(`search.kinds.${k}`)}
                  title={t(`search.kinds.${k}`)}
                  onClick={() => (on ? pickScope("all") : pickScope("media", k))}
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
                    on
                      ? "bg-primary text-primary-foreground"
                      : "text-muted hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
          {!shows ? (
            <p className="text-muted px-4 py-5 text-center text-sm">
              {t(`search.paletteHint.${scope === "media" ? "media" : scope}`)}
            </p>
          ) : !loading && all.length === 0 ? (
            <p className="text-muted px-4 py-5 text-center text-sm">{t("search.noResults")}</p>
          ) : (
            <ul
              id="cmdk-list"
              ref={listRef}
              role="listbox"
              className="max-h-[60vh] overflow-y-auto p-2"
            >
              {all.map((h, i) => {
                const Icon = ICONS[h.group] ?? Search;
                return (
                  <li
                    id={`cmdk-${i}`}
                    key={`${h.group}-${h.id}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h.href)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
                      i === active && "bg-surface-2",
                    )}
                  >
                    {h.group === "users" ? (
                      <Avatar
                        name={h.title}
                        image={h.image ?? null}
                        className="size-7 text-[11px]"
                      />
                    ) : h.group === "media" ? (
                      <Cover
                        type={(h.kind ?? "book") as "book"}
                        title={h.title}
                        src={coverSrc(h, 160)}
                        className="h-10 w-7 shrink-0 rounded"
                      />
                    ) : (
                      <Icon className="text-muted size-4 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate font-medium">
                        <span className="truncate">{h.title}</span>
                        {h.premium && <PremiumBadge />}
                      </span>
                      {h.subtitle && (
                        <span className="text-muted block truncate text-xs">{h.subtitle}</span>
                      )}
                    </span>
                    {h.group !== "all" && (
                      <span className="text-muted text-xs">{t(`search.groups.${h.group}`)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

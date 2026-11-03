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
  LayoutGrid,
  Library,
  PenLine,
  Play,
  Quote,
  Search,
  User,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useRef, useState } from "react";
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

/**
 * Where the search looks, as icons (like Telegram's tabs): my Darsxona, people,
 * and the kinds of posts others made. A tap looks in one; a double tap pins it,
 * and the pinned ones are searched together (and kept for next time).
 */
const FILTERS = [
  ["library", Library],
  ["people", Users],
  ["book", BookOpen],
  ["video", Play],
  ["podcast", Headphones],
  ["course", GraduationCap],
  ["document", FileText],
] as const;
type Filter = (typeof FILTERS)[number][0];
const KIND_SET = new Set<string>(["book", "video", "podcast", "course", "document"]);
const PINS_KEY = "nn:search-pins";

function readPins(): Filter[] {
  try {
    const v = JSON.parse(localStorage.getItem(PINS_KEY) ?? "[]") as unknown;
    const known = new Set<string>(FILTERS.map(([k]) => k));
    return Array.isArray(v) ? (v.filter((x) => known.has(x)) as Filter[]) : [];
  } catch {
    return [];
  }
}

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
  // Where to look now (none = everywhere) and what is pinned.
  const [sel, setSel] = useState<Filter[]>([]);
  const [pins, setPins] = useState<Filter[]>([]);
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

  // What is asked for: the words plus where to look (kinds alone list their newest posts).
  const where = sel.join(",");
  const onlyKinds = sel.length > 0 && sel.every((x) => KIND_SET.has(x));
  const ask = `${where}|${debounced.trim()}`;
  const asking = !!debounced.trim() || onlyKinds;
  useEffect(() => {
    if (!asking) return;
    const ctrl = new AbortController();
    const u = new URLSearchParams({ q: debounced });
    if (where) u.set("in", where);
    fetch(`/api/search/quick?${u}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: Hit[] }) => {
        setItems(d.items);
        setActive(0);
        setLoadedFor(ask);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [ask, asking, debounced, where]);

  const typed = !!q.trim();
  const shows = typed || onlyKinds;
  const loading = shows && (q !== debounced || ask !== loadedFor);
  const pick = (x: Filter | null) => {
    setSel(x ? [x] : []);
    setActive(0);
  };
  const pin = (x: Filter) => {
    const next = pins.includes(x) ? pins.filter((p) => p !== x) : [...pins, x];
    setPins(next);
    setSel(next);
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };
  // The words in the box and the hint follow the one place chosen.
  const one = sel.length === 1 ? sel[0] : null;
  const mode = !one ? (sel.length ? "mix" : "all") : KIND_SET.has(one) ? "media" : one;
  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const hits = shows && loadedFor === ask ? items : [];
  // The full search page covers my own things, so it is offered for those.
  const all: Hit[] =
    typed && (!sel.length || sel.includes("library"))
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
    <D.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          const p = readPins();
          setPins(p);
          setSel(p);
        }
      }}
    >
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
              placeholder={t(`search.palette.${mode === "mix" ? "all" : mode}`)}
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
            <FilterBtn label={t("search.scope.all")} on={!sel.length} onClick={() => pick(null)}>
              <LayoutGrid className="size-4" />
            </FilterBtn>
            {FILTERS.map(([k, Icon], i) => (
              <Fragment key={k}>
                {i === 2 && <span aria-hidden className="bg-border mx-0.5 h-5 w-px shrink-0" />}
                <FilterBtn
                  label={t(
                    k === "library" || k === "people" ? `search.scope.${k}` : `search.kinds.${k}`,
                  )}
                  on={sel.includes(k)}
                  pinned={pins.includes(k)}
                  onClick={() => pick(k)}
                  onDoubleClick={() => pin(k)}
                >
                  <Icon className="size-4" />
                </FilterBtn>
              </Fragment>
            ))}
          </div>
          {!shows ? (
            <p className="text-muted px-4 py-5 text-center text-sm">
              {t(`search.paletteHint.${mode}`)}
              <span className="mt-1 block text-xs opacity-80">{t("search.pinHint")}</span>
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

/** One place to look: an icon; pinned ones carry a dot. */
function FilterBtn({
  label,
  on,
  pinned,
  onClick,
  onDoubleClick,
  children,
}: {
  label: string;
  on: boolean;
  pinned?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-full transition-colors",
        on
          ? "bg-primary text-primary-foreground"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
      {pinned && (
        <span
          aria-hidden
          className={cn(
            "absolute right-1 bottom-1 size-1.5 rounded-full",
            on ? "bg-primary-foreground" : "bg-primary",
          )}
        />
      )}
    </button>
  );
}

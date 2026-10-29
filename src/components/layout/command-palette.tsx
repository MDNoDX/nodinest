"use client";
import { comboLabel, getShortcuts, matches, useIsApple, useShortcuts } from "@/lib/shortcuts";
import { AtSign, BookOpen, FileText, Hash, Quote, Search, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Dialog as D } from "radix-ui";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/hooks";

type Hit = {
  group: string;
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
  kind: string | null;
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  users: AtSign,
  resources: BookOpen,
  people: User,
  quotes: Quote,
  notes: FileText,
  categories: Hash,
};

export function CommandPalette() {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const keys = useShortcuts();
  const apple = useIsApple();
  const [q, setQ] = useState("");
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

  useEffect(() => {
    if (!debounced.trim()) return;
    const ctrl = new AbortController();
    fetch(`/api/search/quick?q=${encodeURIComponent(debounced)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: Hit[] }) => {
        setItems(d.items);
        setActive(0);
        setLoadedFor(debounced);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [debounced]);

  const loading = !!q.trim() && debounced !== loadedFor;
  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const all = [
    ...(q.trim() ? items : []),
    {
      group: "all",
      id: "all",
      href: `/search?q=${encodeURIComponent(q)}`,
      title: t("search.title"),
      subtitle: q,
      kind: null,
    },
  ];

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <button
          className="border-border bg-surface text-muted hover:border-border-strong flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-sm transition-colors sm:max-w-sm"
          aria-label={t("nav.commandPalette")}
          data-tour="search"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">{t("nav.commandHint")}</span>
          <kbd className="border-border ml-auto hidden rounded border px-1.5 text-[10px] font-medium sm:inline">
            {comboLabel(keys.search, apple)}
          </kbd>
        </button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <D.Content className="border-border bg-surface animate-scale-in fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl">
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
                } else if (e.key === "Enter" && q.trim()) {
                  e.preventDefault();
                  go(all[active]?.href ?? all[all.length - 1].href);
                }
              }}
              placeholder={t("nav.commandHint")}
              className="h-12 flex-1 bg-transparent text-sm outline-none"
              role="combobox"
              aria-expanded={items.length > 0}
              aria-controls="cmdk-list"
              aria-activedescendant={q.trim() ? `cmdk-${active}` : undefined}
              aria-autocomplete="list"
            />
            {loading && (
              <span
                className="border-muted size-3.5 animate-spin rounded-full border-2 border-r-transparent"
                aria-hidden
              />
            )}
          </div>
          {q.trim() && (
            <ul
              id="cmdk-list"
              ref={listRef}
              role="listbox"
              className="max-h-[50vh] overflow-y-auto p-2"
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
                    <Icon className="text-muted size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.title}</span>
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

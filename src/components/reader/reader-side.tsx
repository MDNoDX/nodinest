"use client";
import {
  CloudDownload,
  CloudOff,
  Image as ImageIcon,
  ListTree,
  Loader2,
  NotebookPen,
  Quote,
  Search,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import type { SnippetPart } from "@/lib/normalize";
import type { Mark } from "@/lib/reader-marks";
import type { Chapter } from "@/server/book-structure";
import { isSavedOffline, removeOffline, saveOffline } from "./offline";

const noSubscribe = () => () => {};

export type SideTab = "contents" | "marks" | "search";
type Hit = { page: number; snippet: SnippetPart[] };

/**
 * The reader's side panel: contents (the PDF's own), the user's quotes and
 * notes in this book, search inside the book, and saving it for offline.
 */
export function ReaderSide({
  resourceId,
  tab,
  setTab,
  chapters,
  current,
  preparing,
  marks,
  pages,
  onOpen,
  term,
  setTerm,
}: {
  resourceId: string;
  tab: SideTab;
  setTab: (t: SideTab) => void;
  chapters: Chapter[];
  current: Chapter | null;
  preparing: boolean;
  marks: Mark[];
  /** Text pages (for offline saving). */
  pages: number[];
  onOpen: (page: number, title?: string) => void;
  /** The searched words (highlighted in the text). */
  term: string;
  setTerm: (q: string) => void;
}) {
  const t = useTranslations("reader");
  const tabs: { k: SideTab; icon: typeof ListTree; label: string; n?: number }[] = [
    { k: "contents", icon: ListTree, label: t("contents") },
    { k: "marks", icon: Quote, label: t("marks"), n: marks.length },
    { k: "search", icon: Search, label: t("search") },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" className="bg-surface-2 mb-2 grid grid-cols-3 gap-0.5 rounded-lg p-0.5">
        {tabs.map(({ k, icon: Icon, label, n }) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            title={label}
            className={cn(
              "flex h-8 items-center justify-center gap-1 rounded-md text-xs font-medium",
              tab === k
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            <span className="truncate">{label}</span>
            {!!n && <span className="text-muted tabular-nums">{n}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "contents" && (
          <Contents chapters={chapters} current={current} preparing={preparing} onOpen={onOpen} />
        )}
        {tab === "marks" && <Marks marks={marks} onOpen={onOpen} />}
        {tab === "search" && (
          <BookSearch resourceId={resourceId} term={term} setTerm={setTerm} onOpen={onOpen} />
        )}
      </div>
      <Offline resourceId={resourceId} pages={pages} />
    </div>
  );
}

function Contents({
  chapters,
  current,
  preparing,
  onOpen,
}: {
  chapters: Chapter[];
  current: Chapter | null;
  preparing: boolean;
  onOpen: (page: number, title?: string) => void;
}) {
  const t = useTranslations("reader");
  if (!chapters.length)
    return preparing ? (
      <p className="text-muted flex items-center gap-1.5 px-2 text-sm">
        <Loader2 className="size-3.5 animate-spin" /> {t("findingContents")}
      </p>
    ) : (
      <p className="text-muted px-2 text-sm">{t("noContents")}</p>
    );
  return (
    <nav aria-label={t("contents")} className="flex flex-col">
      {chapters.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onOpen(c.page, c.title)}
          aria-current={current === c ? "true" : undefined}
          className={cn(
            "hover:bg-surface-2 rounded-md px-2 py-1.5 text-left text-sm",
            c.level === 0 && "mt-2 font-semibold",
            current === c ? "bg-primary-soft text-primary font-medium" : "text-foreground/85",
          )}
        >
          {c.image && (
            <ImageIcon className="mr-1 inline size-3.5 align-[-2px] text-[var(--c-teal)]" />
          )}
          {c.title}
          {c.subtitle && <span className="text-muted ml-1.5 text-xs">· {c.subtitle}</span>}
          <span className="text-muted ml-1.5 text-xs tabular-nums">{c.page}</span>
        </button>
      ))}
    </nav>
  );
}

function Marks({ marks, onOpen }: { marks: Mark[]; onOpen: (page: number) => void }) {
  const t = useTranslations("reader");
  if (!marks.length)
    return <p className="text-muted px-2 text-sm leading-relaxed">{t("noMarks")}</p>;
  const sorted = [...marks].sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => m.page && onOpen(m.page)}
            className="hover:bg-surface-2 flex w-full gap-2 rounded-lg p-2 text-left"
          >
            {m.kind === "quote" ? (
              <Quote className="text-primary mt-0.5 size-4" />
            ) : (
              <NotebookPen className="mt-0.5 size-4 text-[var(--c-amber)]" />
            )}
            <span className="min-w-0 flex-1">
              <span className="line-clamp-3 font-serif text-sm italic">{m.text}</span>
              {m.page && (
                <span className="text-muted text-xs">{t("pageShort", { n: m.page })}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BookSearch({
  resourceId,
  term,
  setTerm,
  onOpen,
}: {
  resourceId: string;
  term: string;
  setTerm: (q: string) => void;
  onOpen: (page: number) => void;
}) {
  const t = useTranslations("reader");
  const [q, setQ] = useState(term);
  const [res, setRes] = useState<{ q: string; total: number; hits: Hit[] } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const timer = setTimeout(async () => {
      setBusy(true);
      const r = await fetch(`/api/book/${resourceId}/search?q=${encodeURIComponent(query)}`).catch(
        () => null,
      );
      setBusy(false);
      if (!r?.ok) return;
      setRes({ q: query, ...((await r.json()) as { total: number; hits: Hit[] }) });
      setTerm(query);
    }, 350);
    return () => clearTimeout(timer);
  }, [q, resourceId, setTerm]);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="text-muted absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) setTerm("");
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          className="border-border-strong bg-surface h-9 w-full rounded-lg border pr-2 pl-8 text-sm"
        />
      </div>
      {busy && <Loader2 className="text-muted mx-auto size-4 animate-spin" />}
      {res && q.trim().length >= 2 && (
        <>
          <p className="text-muted px-1 text-xs">{t("found", { n: res.total })}</p>
          <ul className="flex flex-col gap-1">
            {res.hits.map((h) => (
              <li key={h.page}>
                <button
                  type="button"
                  onClick={() => onOpen(h.page)}
                  className="hover:bg-surface-2 w-full rounded-lg p-2 text-left text-sm"
                >
                  <span className="text-muted mr-1.5 text-xs tabular-nums">{h.page}</span>
                  {h.snippet.map((s, i) =>
                    s.match ? (
                      <mark key={i} className="rounded-sm bg-[var(--c-amber)]/25 text-inherit">
                        {s.text}
                      </mark>
                    ) : (
                      <span key={i}>{s.text}</span>
                    ),
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Offline({ resourceId, pages }: { resourceId: string; pages: number[] }) {
  const t = useTranslations("reader");
  // Saved earlier on this device (read after hydration), then what the user did here.
  const stored = useSyncExternalStore(
    noSubscribe,
    () => isSavedOffline(resourceId),
    () => false,
  );
  const [changed, setSaved] = useState<boolean | null>(null);
  const saved = changed ?? stored;
  const [pct, setPct] = useState<number | null>(null);
  return (
    <div className="border-border mt-2 border-t pt-2">
      {pct != null ? (
        <p className="text-muted flex items-center gap-2 px-2 py-1.5 text-xs">
          <Loader2 className="size-3.5 animate-spin" /> {t("savingOffline", { pct })}
        </p>
      ) : saved ? (
        <div className="flex items-center gap-1 px-2 py-1 text-xs">
          <CloudOff className="size-3.5 text-[var(--c-emerald)]" />
          <span className="text-muted flex-1">{t("offlineReady")}</span>
          <button
            type="button"
            onClick={async () => {
              await removeOffline(resourceId, pages);
              setSaved(false);
            }}
            className="text-muted hover:text-danger rounded p-1"
            aria-label={t("offlineRemove")}
            title={t("offlineRemove")}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={async () => {
            setPct(0);
            try {
              await saveOffline(resourceId, pages, setPct);
              setSaved(true);
              toast.success(t("offlineDone"));
            } catch {
              toast.error(t("offlineFailed"));
            } finally {
              setPct(null);
            }
          }}
          className="text-muted hover:text-foreground hover:bg-surface-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
          title={t("offlineHint")}
        >
          <CloudDownload className="size-3.5" /> {t("offlineSave")}
        </button>
      )}
    </div>
  );
}

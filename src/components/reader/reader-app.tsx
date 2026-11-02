"use client";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Fullscreen,
  Headphones,
  Loader2,
  Minimize2,
  Sparkles,
  TableOfContents,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { saveNoteAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { blocksFromParas, stripBlocks, stripRunning, type BookBlock } from "@/lib/book-blocks";
import { cn } from "@/lib/cn";
import { marked, type Mark } from "@/lib/reader-marks";
import { reflow } from "@/lib/reflow";
import type { ReaderData } from "@/server/reader";
import { offlinePages } from "./offline";
import { copySheet, turnPage } from "./page-turn";
import { PdfPage } from "./pdf-page";
import { ReaderAi, type ReaderAsk } from "./reader-ai";
import { PAPER, paperVars, useReaderPrefs } from "./reader-prefs";
import { MarkMenu, NoteDialog, SelectionMenu, type Sel } from "./reader-selection";
import { ReaderSettings } from "./reader-settings";
import { ReaderSide, type SideTab } from "./reader-side";

type Res = { id: string; title: string; authors: string };
type Page = { page: number; blocks: BookBlock[]; laidOut: boolean };

const AHEAD = 6;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

const ZOOMS = [1, 1.2, 1.4, 1.7, 2];
const WHO = ["--c-blue", "--c-teal", "--c-rose", "--c-amber", "--c-violet", "--c-emerald"];
/** Each speaker keeps a colour through the whole book. */
const whoColor = (name: string) => {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return `var(${WHO[h % WHO.length]})`;
};

/**
 * Kitobni o'qish: one page at a time, numbered as in the PDF, as wide as the
 * screen allows. It fits the window; zoom makes the text bigger and the page
 * scrolls. Each page shows the laid-out text (server/book-format.ts) or, for
 * pictures and scanned books, the PDF page itself. Quotes, notes, contents,
 * search and the AI work on it as before.
 */
export function ReaderApp({
  resource,
  data,
  start,
  preparing,
  viewer,
}: {
  resource: Res;
  data: ReaderData;
  start: number;
  /** The chapters are being found: refresh until they are there. */
  preparing: boolean;
  /**
   * Someone else's book whose text its owner made public: pages come from the
   * owner's copy; no AI, no audiobook, no progress or offline copy.
   */
  viewer?: { ownerId: string; back: string };
}) {
  const ownerQ = viewer ? `&owner=${viewer.ownerId}` : "";
  const t = useTranslations("reader");
  const router = useRouter();
  const prefs = useReaderPrefs();
  const total = Math.max(data.totalPages, data.pages.at(-1) ?? 1, 1);
  const [pages, setPages] = useState<Record<number, Page>>({});
  const [at, setAt] = useState(start);
  const [marks, setMarks] = useState<Mark[]>(data.marks);
  const [sel, setSel] = useState<Sel | null>(null);
  const [noteFor, setNoteFor] = useState<Sel | null>(null);
  const [markMenu, setMarkMenu] = useState<{ m: Mark; x: number; y: number } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<SideTab>("contents");
  const [term, setTerm] = useState("");
  const [ai, setAi] = useState(false);
  const [ask, setAsk] = useState<ReaderAsk | null>(null);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [original, setOriginal] = useState<Set<number>>(new Set());
  const stage = useRef<HTMLDivElement>(null);
  const turned = useRef<{ at: number; stop?: () => void }>({ at: 0 });
  const swipe = useRef<number | null>(null);

  const chapters = useMemo(() => data.structure?.chapters ?? [], [data.structure]);
  const noise = useMemo(() => new Set(data.structure?.noise ?? []), [data.structure]);
  const pictures = useMemo(
    () =>
      new Set(
        data.fileId
          ? (data.structure?.images ?? []).filter((i) => i.textless).map((i) => i.page)
          : [],
      ),
    [data.fileId, data.structure],
  );
  const left = at;

  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [preparing, router]);

  const fetchRange = useCallback(
    async (from: number, to: number) => {
      let raw: { page: number; content: string; blocks?: BookBlock[] | null }[] = [];
      try {
        const r = await fetch(`/api/book/${resource.id}/pages?from=${from}&to=${to}${ownerQ}`);
        if (!r.ok) throw new Error(String(r.status));
        raw = ((await r.json()) as { pages: typeof raw }).pages;
      } catch {
        // No network: the copy saved on this device (if any).
        raw = viewer ? [] : await offlinePages(resource.id, from, to);
      }
      setPages((cur) => {
        const next = { ...cur };
        for (const p of raw)
          next[p.page] = {
            page: p.page,
            blocks: stripBlocks(
              p.blocks ??
                blocksFromParas(reflow(stripRunning(p.content, p.page, data.running), noise)),
              p.page,
              data.running,
            ),
            laidOut: !!p.blocks,
          };
        return next;
      });
    },
    [resource.id, noise, data.running, ownerQ, viewer],
  );

  // The pages in view and the next few are always at hand.
  useEffect(() => {
    queueMicrotask(() => void fetchRange(Math.max(1, left - 2), Math.min(total, left + AHEAD)));
  }, [left, total, fetchRange]);

  // Pages not laid out yet are done around the reader, then shown.
  const laying = useRef(false);
  useEffect(() => {
    if (data.scanned || laying.current || viewer) return;
    if (!pages[at] || pages[at].laidOut) return;
    laying.current = true;
    void fetch(`/api/book/${resource.id}/format`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: left }),
    })
      .then((r) => (r.ok ? fetchRange(left, Math.min(total, left + AHEAD)) : undefined))
      .catch(() => {})
      .finally(() => {
        laying.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, pages]);

  const openAt = useCallback(
    (page: number) => {
      setDrawer(false);
      setAt(Math.max(1, Math.min(total, page)));
    },
    [total],
  );

  /** A turn starts at once; one in progress ends and gives way to it. */
  const turn = useCallback(
    (dir: 1 | -1) => {
      const next = at + dir;
      if (next < 1 || next > total) return;
      if (performance.now() - turned.current.at < 140) return;
      turned.current.stop?.();
      setSel(null);
      const box = stage.current;
      if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches) return setAt(next);
      const sheet = () => box.querySelector<HTMLElement>("[data-sheet=one]");
      const was = sheet();
      const scroll = was?.querySelector(".book-body")?.scrollTop ?? 0;
      const before = was && copySheet(was);
      flushSync(() => setAt(next));
      const now = sheet();
      if (!before || !now) return;
      turned.current = {
        at: performance.now(),
        stop:
          dir === 1
            ? turnPage({ box, leaf: before, dir, scroll })
            : turnPage({ box, leaf: copySheet(now), under: before, dir }),
      };
    },
    [at, total],
  );

  // Arrows, space and the page keys; F for full screen.
  const realFull = useRef(false);
  const toggleFull = useCallback(() => {
    setFull((on) => {
      if (on) void document.exitFullscreen?.().catch(() => null);
      else void document.documentElement.requestFullscreen?.().catch(() => null);
      return !on;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as Element;
      if (el.closest?.("input,textarea,[contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)
        return;
      const body = stage.current?.querySelector<HTMLElement>("[data-sheet=one] .book-body");
      const left = body ? body.scrollHeight - body.clientHeight - body.scrollTop : 0;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        turn(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        turn(-1);
      } else if (e.key === "PageDown" || e.key === " ") {
        // A long page is read to its end first.
        e.preventDefault();
        if (body && left > 1) body.scrollBy({ top: body.clientHeight * 0.85 });
        else turn(1);
      } else if (e.key === "PageUp") {
        e.preventDefault();
        if (body && body.scrollTop > 1) body.scrollBy({ top: -body.clientHeight * 0.85 });
        else turn(-1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        body?.scrollBy({ top: e.key === "ArrowDown" ? 70 : -70 });
      } else if (e.key.toLowerCase() === "f") toggleFull();
    };
    const onFull = () => {
      if (document.fullscreenElement) realFull.current = true;
      else if (realFull.current) {
        realFull.current = false;
        setFull(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFull);
    };
  }, [toggleFull, turn]);

  // Full screen: the app's frame goes away and only the book stays.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reader = "1";
    if (full) root.dataset.readerFull = "1";
    else delete root.dataset.readerFull;
    return () => {
      delete root.dataset.reader;
      delete root.dataset.readerFull;
    };
  }, [full]);

  // The page reached is the reading progress (saved now and then).
  useEffect(() => {
    if (viewer) return;
    const timer = setTimeout(() => {
      void fetch(`/api/book/${resource.id}/progress`, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: left, total }),
      }).catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, [left, resource.id, total, viewer]);

  // The selection menu follows the selected text.
  useEffect(() => {
    const onUp = () =>
      setTimeout(() => {
        const s = window.getSelection();
        const text = s?.toString().trim() ?? "";
        if (!s || !text || !stage.current?.contains(s.anchorNode)) return setSel(null);
        const r = s.getRangeAt(0).getBoundingClientRect();
        const node = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
        setSel({
          text: norm(text).slice(0, 4000),
          page: Number(node?.closest<HTMLElement>("[data-page]")?.dataset.page ?? left),
          context: norm(node?.closest("[data-para]")?.textContent ?? "").slice(0, 4000),
          x: r.left + r.width / 2,
          y: r.top,
        });
      }, 0);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keyup", onUp);
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keyup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  }, [left]);

  const save = async (kind: "quote" | "note", s: Sel, thought = "") => {
    const r = await saveNoteAction({
      kind,
      quoteText: s.text.slice(0, 10_000),
      ...(kind === "note"
        ? { body: thought.trim() || s.text }
        : thought.trim()
          ? { body: thought.trim() }
          : {}),
      resourceId: resource.id,
      pageFrom: s.page,
    });
    if (!r.ok) return void toast.error(kind === "quote" ? t("quoteFailed") : t("noteFailed"));
    setMarks((m) => [...m, { id: r.data, kind, text: s.text, page: s.page }]);
    window.getSelection()?.removeAllRanges();
    setSel(null);
    setNoteFor(null);
    toast.success(kind === "quote" ? t("quoteSaved") : t("noteSaved"), {
      action: { label: t("open"), onClick: () => window.open(`/notes/${r.data}`, "_blank") },
    });
  };

  const chapterOf = useCallback(
    (page: number) => {
      let c: (typeof chapters)[number] | null = null;
      for (const ch of chapters) if (ch.page <= page) c = ch;
      return c;
    },
    [chapters],
  );

  const side = (
    <ReaderSide
      resourceId={resource.id}
      ownerId={viewer?.ownerId}
      tab={tab}
      setTab={setTab}
      chapters={chapters}
      current={chapterOf(left)}
      preparing={preparing}
      marks={marks}
      pages={data.pages}
      onOpen={(p) => openAt(p)}
      term={term}
      setTerm={setTerm}
    />
  );
  const paper = prefs.paper === "auto" ? null : PAPER[prefs.paper];
  const tool =
    "text-muted hover:text-foreground hover:bg-surface-2 grid size-9 place-items-center rounded-lg transition-colors disabled:opacity-40";

  return (
    <div
      className="reader-root bg-background text-foreground -mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden sm:-mx-6 sm:-my-8"
      style={paper ? paperVars(paper) : undefined}
    >
      <div className="reader-bar flex items-center gap-0.5 px-2 py-1.5 sm:px-4">
        <Link
          href={viewer?.back ?? `/library/${resource.id}`}
          className={tool}
          aria-label={t("close")}
          title={t("close")}
        >
          <ArrowLeft className="size-[18px]" />
        </Link>
        <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">
          <span className="max-sm:hidden">{resource.title}</span>
        </p>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className={tool}
          aria-label={t("contents")}
          title={t("contents")}
        >
          <TableOfContents className="size-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0, z - 1))}
          disabled={zoom === 0}
          className={tool}
          aria-label={t("smaller")}
          title={t("smaller")}
        >
          <ZoomOut className="size-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
          disabled={zoom === ZOOMS.length - 1}
          className={tool}
          aria-label={t("bigger")}
          title={t("bigger")}
        >
          <ZoomIn className="size-[18px]" />
        </button>
        <ReaderSettings className={tool} />
        <button
          type="button"
          onClick={toggleFull}
          className={tool}
          aria-label={t(full ? "exitFull" : "fullScreen")}
          title={t(full ? "exitFull" : "fullScreen")}
          aria-pressed={full}
        >
          {full ? <Minimize2 className="size-[18px]" /> : <Fullscreen className="size-[18px]" />}
        </button>
        {!viewer && (
          <>
            <Button asChild size="sm" variant="outline" className="ml-1.5">
              <Link href={`/library/${resource.id}/audiobook`}>
                <Headphones /> <span className="max-sm:hidden">{t("listen")}</span>
              </Link>
            </Button>
            <Button
              size="sm"
              variant={ai ? "secondary" : "outline"}
              className="ml-1"
              onClick={() => setAi((v) => !v)}
              aria-label={t("askAi")}
              aria-pressed={ai}
            >
              <Sparkles /> <span className="max-sm:hidden">{t("askAi")}</span>
            </Button>
          </>
        )}
      </div>

      <div className="group/stage relative min-h-0 flex-1 px-2 pb-2 sm:px-3">
        <div
          ref={stage}
          className={cn(
            "book-stage relative h-full",
            prefs.family === "serif" ? "font-serif" : "font-sans",
            ai && "lg:mr-[24rem]",
          )}
          onTouchStart={(e) => {
            swipe.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (swipe.current == null || window.getSelection()?.toString()) return;
            const dx = e.changedTouches[0].clientX - swipe.current;
            swipe.current = null;
            if (Math.abs(dx) > 60) turn(dx < 0 ? 1 : -1);
          }}
        >
          <Sheet
            key={at}
            n={at}
            page={pages[at]}
            picture={
              !!data.fileId &&
              (data.scanned ||
                pictures.has(at) ||
                original.has(at) ||
                pages[at]?.blocks.length === 0)
            }
            fileId={data.fileId}
            canFlip={!!data.fileId && !pictures.has(at) && !data.scanned}
            flipped={original.has(at)}
            onFlip={() =>
              setOriginal((cur) => {
                const n = new Set(cur);
                if (n.has(at)) n.delete(at);
                else n.add(at);
                return n;
              })
            }
            size={prefs.size}
            leading={prefs.leading}
            zoom={ZOOMS[zoom]}
            marks={marks}
            term={term}
            onMark={(m, x, y) => setMarkMenu({ m, x, y })}
          />
          <button
            type="button"
            aria-label={t("prevPage")}
            onClick={() => turn(-1)}
            disabled={at <= 1}
            className="book-arrow left-1"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t("nextPage")}
            onClick={() => turn(1)}
            disabled={at >= total}
            className="book-arrow right-1"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      {drawer && (
        <div
          className="fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label={t("contents")}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawer(false)}
            aria-label={t("close")}
          />
          <div className="bg-surface text-foreground absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col p-3 shadow-xl">
            <div className="mb-2 flex items-center">
              <p className="truncate text-sm font-semibold">{resource.title}</p>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="text-muted ml-auto p-1"
                aria-label={t("close")}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{side}</div>
          </div>
        </div>
      )}
      {ai && (
        <aside className="border-border bg-surface text-foreground fixed inset-x-0 top-14 bottom-0 z-30 border-l shadow-xl sm:left-auto sm:w-[24rem] lg:shadow-none">
          <ReaderAi resourceId={resource.id} page={left} ask={ask} onClose={() => setAi(false)} />
        </aside>
      )}
      {sel && !noteFor && (
        <SelectionMenu
          sel={sel}
          onQuote={() => void save("quote", sel)}
          onNote={() => setNoteFor(sel)}
          onAsk={
            viewer
              ? undefined
              : () => {
                  setAsk({
                    selection: sel.text,
                    context: sel.context,
                    page: sel.page,
                    n: Date.now(),
                  });
                  setAi(true);
                  setSel(null);
                }
          }
          onDone={() => setSel(null)}
        />
      )}
      {noteFor && (
        <NoteDialog
          sel={noteFor}
          onSave={(thought) => save("note", noteFor, thought)}
          onClose={() => setNoteFor(null)}
        />
      )}
      {markMenu && <MarkMenu {...markMenu} onClose={() => setMarkMenu(null)} />}
    </div>
  );
}

/** One page of the book, numbered as in the PDF: the same text size on every page; a long one scrolls. */
function Sheet({
  n,
  page,
  picture,
  fileId,
  canFlip,
  flipped,
  onFlip,
  size,
  leading,
  zoom,
  marks,
  term,
  onMark,
}: {
  n: number;
  page?: Page;
  picture: boolean;
  fileId: string | null;
  canFlip: boolean;
  flipped: boolean;
  onFlip: () => void;
  size: number;
  leading: number;
  zoom: number;
  marks: Mark[];
  term: string;
  onMark: (m: Mark, x: number, y: number) => void;
}) {
  const t = useTranslations("reader");
  const text = (s: string) =>
    marked(s, marks, term).map((piece, k) =>
      typeof piece === "string" ? (
        piece
      ) : "hit" in piece ? (
        <mark key={k} className="rounded-sm bg-[var(--c-amber)]/35 text-inherit">
          {piece.t}
        </mark>
      ) : (
        <mark
          key={k}
          onClick={(e) => {
            if (window.getSelection()?.toString()) return;
            onMark(piece.m, e.clientX, e.clientY);
          }}
          className={cn(
            "cursor-pointer rounded-sm px-0.5 text-inherit",
            piece.m.kind === "quote"
              ? "bg-primary-soft border-primary/50 border-b-2"
              : "taqriz-note-mark",
          )}
        >
          {piece.t}
        </mark>
      ),
    );

  return (
    <section data-sheet="one" data-page={n} className="book-sheet">
      <div
        className={cn("book-body", zoom > 1 && "book-zoomed")}
        style={{ fontSize: size * zoom, lineHeight: leading }}
        lang="und"
      >
        {picture && fileId ? (
          <PdfPage fileId={fileId} page={n} alt={String(n)} className="book-pdf" />
        ) : !page ? (
          <Loader2 className="text-muted mx-auto mt-[30vh] size-6 animate-spin" />
        ) : (
          page.blocks.map((b, i) =>
            b.k === "h" ? (
              <h2 key={i} data-para className="book-h">
                {text(b.t)}
              </h2>
            ) : b.k === "d" ? (
              <p
                key={i}
                data-para
                className="book-d"
                data-who={b.s ? "" : undefined}
                style={
                  { "--who": b.s ? whoColor(b.s) : "var(--border-strong)" } as React.CSSProperties
                }
              >
                {b.s && <span className="book-who select-none">{b.s}</span>}
                {text(b.t)}
              </p>
            ) : (
              <p key={i} data-para className={`book-${b.k}`}>
                {text(b.t)}
              </p>
            ),
          )
        )}
      </div>
      <footer className="book-foot">
        <span className="tabular-nums">{n}</span>
        {canFlip && (
          <button type="button" onClick={onFlip} title={t("originalHint")} className="book-flip">
            {flipped ? t("hideOriginal") : t("original")}
          </button>
        )}
      </footer>
    </section>
  );
}

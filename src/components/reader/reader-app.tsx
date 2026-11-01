"use client";
import { ArrowLeft, Headphones, ListTree, Maximize, Minimize, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { saveNoteAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { blocksFromParas, type BookBlock } from "@/lib/book-blocks";
import { cn } from "@/lib/cn";
import { marked, type Mark } from "@/lib/reader-marks";
import { reflow } from "@/lib/reflow";
import type { ReaderData } from "@/server/reader";
import { offlinePages } from "./offline";
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

const useWide = () =>
  useSyncExternalStore(
    (cb) => {
      const m = matchMedia("(min-width: 1024px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia("(min-width: 1024px)").matches,
    () => true,
  );

/**
 * Kitobni o'qish: the book page by page, numbered as in its PDF. Two facing
 * pages that turn on wide screens, one page and a swipe on phones. Each page
 * shows the laid-out text (server/book-format.ts) or, for pictures and scanned
 * books, the PDF page itself. Quotes, notes, contents, search and the AI work
 * on it as before.
 */
export function ReaderApp({
  resource,
  data,
  start,
  preparing,
}: {
  resource: Res;
  data: ReaderData;
  start: number;
  /** The chapters are being found: refresh until they are there. */
  preparing: boolean;
}) {
  const t = useTranslations("reader");
  const router = useRouter();
  const prefs = useReaderPrefs();
  const wide = useWide();
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
  const [original, setOriginal] = useState<Set<number>>(new Set());
  const stage = useRef<HTMLDivElement>(null);
  const turning = useRef(false);
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
  // Facing pages: 1-2, 3-4…
  const left = wide ? at - ((at - 1) % 2) : at;
  const shown = wide ? [left, left + 1].filter((p) => p <= total) : [left];
  const step = wide ? 2 : 1;

  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [preparing, router]);

  const fetchRange = useCallback(
    async (from: number, to: number) => {
      let raw: { page: number; content: string; blocks?: BookBlock[] | null }[] = [];
      try {
        const r = await fetch(`/api/book/${resource.id}/pages?from=${from}&to=${to}`);
        if (!r.ok) throw new Error(String(r.status));
        raw = ((await r.json()) as { pages: typeof raw }).pages;
      } catch {
        // No network: the copy saved on this device (if any).
        raw = await offlinePages(resource.id, from, to);
      }
      setPages((cur) => {
        const next = { ...cur };
        for (const p of raw)
          next[p.page] = {
            page: p.page,
            blocks: p.blocks ?? blocksFromParas(reflow(p.content, noise)),
            laidOut: !!p.blocks,
          };
        return next;
      });
    },
    [resource.id, noise],
  );

  // The pages in view and the next few are always at hand.
  useEffect(() => {
    queueMicrotask(() => void fetchRange(Math.max(1, left - 2), Math.min(total, left + AHEAD)));
  }, [left, total, fetchRange]);

  // Pages not laid out yet are done around the reader, then shown.
  const laying = useRef(false);
  useEffect(() => {
    if (data.scanned || laying.current) return;
    if (!shown.some((p) => pages[p] && !pages[p].laidOut)) return;
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

  /** The turn: copies of the old and new pages swing over the spine. */
  const turn = useCallback(
    (dir: 1 | -1) => {
      const next = left + dir * step;
      if (next < 1 || next > total || turning.current) return;
      setSel(null);
      const box = stage.current;
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!box || !wide || still) return setAt(next);
      const copy = (side: string) =>
        box.querySelector(`[data-sheet=${side}]`)?.cloneNode(true) as HTMLElement | undefined;
      const oldL = copy("left");
      const oldR = copy("right");
      flushSync(() => setAt(next));
      const newL = copy("left");
      const newR = copy("right");
      if (!oldL || !oldR || !newL || !newR) return;
      turning.current = true;
      const layer = document.createElement("div");
      layer.className = "book-turn";
      layer.setAttribute("aria-hidden", "true");
      const sheet = document.createElement("div");
      sheet.className = `book-leaf ${dir === 1 ? "book-leaf-next" : "book-leaf-prev"}`;
      const front = dir === 1 ? oldR : oldL;
      const back = dir === 1 ? newL : newR;
      const stay = dir === 1 ? oldL : oldR;
      stay.classList.add(dir === 1 ? "book-stay-left" : "book-stay-right");
      back.classList.add("book-leaf-back");
      sheet.append(front, back);
      layer.append(stay, sheet);
      box.appendChild(layer);
      window.setTimeout(() => {
        layer.remove();
        turning.current = false;
      }, 640);
    },
    [left, step, total, wide],
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
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        turn(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        turn(-1);
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
    const timer = setTimeout(() => {
      void fetch(`/api/book/${resource.id}/progress`, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: left, total }),
      }).catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, [left, resource.id, total]);

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
  const iconBtn = "rounded-full p-2 text-white/80 transition hover:bg-white/15 hover:text-white";

  return (
    <div
      className="bg-background text-foreground -mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden sm:-mx-6 sm:-my-8"
      style={paper ? paperVars(paper) : undefined}
    >
      <div className="reader-bar flex items-center gap-2 px-3 py-2 sm:px-5">
        <Link
          href={`/library/${resource.id}`}
          className="hover:bg-surface-2 rounded-md p-1.5 opacity-70 hover:opacity-100"
          aria-label={t("back")}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{resource.title}</p>
        <Button asChild size="sm" variant="outline">
          <Link href={`/library/${resource.id}/audiobook`}>
            <Headphones /> {t("listen")}
          </Link>
        </Button>
        <Button
          size="sm"
          variant={ai ? "secondary" : "outline"}
          onClick={() => setAi((v) => !v)}
          aria-label={t("askAi")}
          aria-pressed={ai}
        >
          <Sparkles /> <span className="hidden sm:inline">{t("askAi")}</span>
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 px-3 pb-20 sm:px-6">
        <div
          ref={stage}
          className={cn(
            "book-stage relative mx-auto h-full max-w-[84rem]",
            wide && "grid grid-cols-2",
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
          {shown.map((p, i) => (
            <Sheet
              key={p}
              side={wide ? (i === 0 ? "left" : "right") : "one"}
              n={p}
              page={pages[p]}
              head={wide && i === 0 ? resource.title : (chapterOf(p)?.title ?? "")}
              picture={
                !!data.fileId &&
                (data.scanned ||
                  pictures.has(p) ||
                  original.has(p) ||
                  pages[p]?.blocks.length === 0)
              }
              fileId={data.fileId}
              canFlip={!!data.fileId && !pictures.has(p) && !data.scanned}
              flipped={original.has(p)}
              onFlip={() =>
                setOriginal((cur) => {
                  const n = new Set(cur);
                  if (n.has(p)) n.delete(p);
                  else n.add(p);
                  return n;
                })
              }
              size={prefs.size}
              leading={prefs.leading}
              marks={marks}
              term={term}
              onMark={(m, x, y) => setMarkMenu({ m, x, y })}
            />
          ))}
          {wide && shown.length === 1 && <div data-sheet="right" className="book-sheet" />}
          <button
            type="button"
            aria-label={t("prevPage")}
            onClick={() => turn(-1)}
            className="book-edge left-0"
          />
          <button
            type="button"
            aria-label={t("nextPage")}
            onClick={() => turn(1)}
            className="book-edge right-0"
          />
        </div>

        <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-2">
          <span className="rounded-full bg-black/80 px-4 py-2.5 text-sm font-medium text-white tabular-nums shadow-lg">
            {shown.length > 1 ? `${shown[0]}-${shown[1]}` : shown[0]} / {total}
          </span>
          <div className="flex items-center gap-0.5 rounded-full bg-black/80 px-1.5 py-1 shadow-lg">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className={iconBtn}
              aria-label={t("contents")}
              title={t("contents")}
            >
              <ListTree className="size-[18px]" />
            </button>
            <button
              type="button"
              onClick={toggleFull}
              className={iconBtn}
              aria-label={t(full ? "exitFull" : "fullScreen")}
              title={t(full ? "exitFull" : "fullScreen")}
              aria-pressed={full}
            >
              {full ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
            </button>
            <ReaderSettings className={iconBtn} />
          </div>
          <Link
            href={`/library/${resource.id}`}
            className="grid size-10 place-items-center rounded-full bg-black/80 text-white/80 shadow-lg transition hover:text-white"
            aria-label={t("close")}
            title={t("close")}
          >
            <X className="size-[18px]" />
          </Link>
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
          onAsk={() => {
            setAsk({ selection: sel.text, context: sel.context, page: sel.page, n: Date.now() });
            setAi(true);
            setSel(null);
          }}
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

/** One page of the book, numbered as in the PDF; the text shrinks a little to fit it. */
function Sheet({
  side,
  n,
  page,
  head,
  picture,
  fileId,
  canFlip,
  flipped,
  onFlip,
  size,
  leading,
  marks,
  term,
  onMark,
}: {
  side: "left" | "right" | "one";
  n: number;
  page?: Page;
  head: string;
  picture: boolean;
  fileId: string | null;
  canFlip: boolean;
  flipped: boolean;
  onFlip: () => void;
  size: number;
  leading: number;
  marks: Mark[];
  term: string;
  onMark: (m: Mark, x: number, y: number) => void;
}) {
  const t = useTranslations("reader");
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const fit = () => {
      for (let k = 1; k >= 0.72; k -= 0.03) {
        el.style.fontSize = `${size * k}px`;
        if (el.scrollHeight <= el.clientHeight + 1) break;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size, leading, page, picture]);

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
    <section data-sheet={side} data-page={n} className="book-sheet">
      <header className={cn("book-head", side === "right" && "text-right")}>{head}</header>
      <div
        ref={body}
        className="book-body"
        style={{ fontSize: size, lineHeight: leading }}
        lang="und"
      >
        {picture && fileId ? (
          <PdfPage fileId={fileId} page={n} alt={String(n)} className="book-pdf" />
        ) : (
          page?.blocks.map((b, i) =>
            b.k === "h" ? (
              <h2 key={i} data-para className="book-h">
                {text(b.t)}
              </h2>
            ) : (
              <p key={i} data-para className={`book-${b.k}`}>
                {text(b.t)}
              </p>
            ),
          )
        )}
      </div>
      <footer className={cn("book-foot", side === "right" && "flex-row-reverse")}>
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

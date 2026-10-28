"use client";
import {
  ArrowLeft,
  ChevronUp,
  ExternalLink,
  FileText,
  Headphones,
  ListTree,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { saveNoteAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { marked, type Mark } from "@/lib/reader-marks";
import { reflow, type Para } from "@/lib/reflow";
import type { ReaderData } from "@/server/reader";
import { offlinePages } from "./offline";
import { PdfPage } from "./pdf-page";
import { ReaderAi, type ReaderAsk } from "./reader-ai";
import { PAPER, useReaderPrefs, WIDTH } from "./reader-prefs";
import { MarkMenu, NoteDialog, SelectionMenu, type Sel } from "./reader-selection";
import { ReaderSettings } from "./reader-settings";
import { ReaderSide, type SideTab } from "./reader-side";

type Res = { id: string; title: string; authors: string };
type Page = { page: number; paras: Para[]; picture?: boolean };

const BATCH = 8;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Kitobni o'qish: the book's text reflowed for reading, with its own
 * contents, pictures drawn from the PDF, the user's quotes and notes, search,
 * offline copy and an AI companion. Display settings live in reader-prefs.
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
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(start);
  const [marks, setMarks] = useState<Mark[]>(data.marks);
  const [sel, setSel] = useState<Sel | null>(null);
  const [noteFor, setNoteFor] = useState<Sel | null>(null);
  const [markMenu, setMarkMenu] = useState<{ m: Mark; x: number; y: number } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<SideTab>("contents");
  const [term, setTerm] = useState("");
  const [ai, setAi] = useState(false);
  const [ask, setAsk] = useState<ReaderAsk | null>(null);
  const [original, setOriginal] = useState<Set<number>>(new Set());
  const main = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const textPages = data.pages;
  // Picture-only pages (maps, plates, the cover) are drawn from the PDF itself.
  const pictures = useMemo(
    () =>
      data.fileId
        ? (data.structure?.images ?? []).filter((i) => i.textless).map((i) => i.page)
        : [],
    [data.fileId, data.structure],
  );
  const firstPage = Math.min(textPages[0] ?? 1, ...pictures);
  const last = Math.max(textPages.at(-1) ?? 1, ...pictures);
  const chapters = useMemo(() => data.structure?.chapters ?? [], [data.structure]);
  const noise = useMemo(() => new Set(data.structure?.noise ?? []), [data.structure]);

  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [preparing, router]);

  const fetchPages = useCallback(
    async (from: number, to: number): Promise<Page[]> => {
      let raw: { page: number; content: string }[] = [];
      try {
        const r = await fetch(`/api/book/${resource.id}/pages?from=${from}&to=${to}`);
        if (!r.ok) throw new Error(String(r.status));
        raw = ((await r.json()) as { pages: typeof raw }).pages;
      } catch {
        // No network: the copy saved on this device (if any).
        raw = await offlinePages(resource.id, from, to);
      }
      const got: Page[] = raw.map((p) => ({ page: p.page, paras: reflow(p.content, noise) }));
      for (const pic of pictures)
        if (pic >= from && pic <= to && !got.some((g) => g.page === pic))
          got.push({ page: pic, paras: [], picture: true });
      return got.sort((a, b) => a.page - b.page);
    },
    [resource.id, noise, pictures],
  );

  /** Scrolls to `title` on `page` (or to the page itself). Only the window scrolls. */
  const scrollTo = useCallback((page: number, title?: string) => {
    requestAnimationFrame(() => {
      const root = main.current;
      if (!root) return;
      const want = title ? norm(title).toLocaleLowerCase() : "";
      const target =
        (want &&
          [
            ...root.querySelectorAll<HTMLElement>(
              `[data-page="${page}"] [data-para], [data-page="${page + 1}"] [data-para]`,
            ),
          ].find((el) =>
            norm(el.textContent ?? "")
              .toLocaleLowerCase()
              .startsWith(want.slice(0, 30)),
          )) ||
        root.querySelector<HTMLElement>(`[data-page="${page}"]`);
      if (target)
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 120 });
    });
  }, []);

  /** Opens the book at `page` (at the chapter title there, if given). */
  const openAt = async (page: number, title?: string) => {
    setDrawer(false);
    setLoading(true);
    const got = await fetchPages(page, page + BATCH - 1);
    setPages(got);
    setLoading(false);
    setCurrent(page);
    scrollTo(page, title);
  };

  useEffect(() => {
    let alive = true;
    void fetchPages(start, start + BATCH - 1).then((got) => {
      if (!alive) return;
      setPages(got);
      setLoading(false);
      scrollTo(start);
    });
    return () => {
      alive = false;
    };
  }, [fetchPages, scrollTo, start]);

  // More pages as the reader scrolls down.
  useEffect(() => {
    const el = bottom.current;
    if (!el) return;
    const io = new IntersectionObserver(
      async ([e]) => {
        if (!e.isIntersecting || loading) return;
        const end = pages.at(-1)?.page ?? 0;
        if (!end || end >= last) return;
        setLoading(true);
        const got = await fetchPages(end + 1, end + BATCH);
        setPages((cur) =>
          [...cur, ...got.filter((g) => !cur.some((c) => c.page === g.page))].slice(-40),
        );
        setLoading(false);
      },
      { rootMargin: "1200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pages, loading, last, fetchPages]);

  const loadEarlier = async () => {
    const first = pages[0]?.page ?? 1;
    if (first <= 1) return;
    const got = await fetchPages(Math.max(1, first - BATCH), first - 1);
    const root = document.scrollingElement;
    const before = root?.scrollHeight ?? 0;
    setPages((cur) => [...got, ...cur].slice(0, 40));
    requestAnimationFrame(() => {
      if (root) root.scrollTop += root.scrollHeight - before;
    });
  };

  // Which page is on screen → progress (saved now and then).
  useEffect(() => {
    const root = main.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.page));
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    root.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch(`/api/book/${resource.id}/progress`, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: current, total: data.totalPages || last }),
      }).catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, [current, resource.id, data.totalPages, last]);

  // The selection menu follows the selected text.
  useEffect(() => {
    const onUp = () =>
      setTimeout(() => {
        const s = window.getSelection();
        const text = s?.toString().trim() ?? "";
        if (!s || !text || !main.current?.contains(s.anchorNode)) return setSel(null);
        const r = s.getRangeAt(0).getBoundingClientRect();
        const node = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
        setSel({
          text: norm(text).slice(0, 4000),
          page: Number(node?.closest<HTMLElement>("[data-page]")?.dataset.page ?? current),
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
  }, [current]);
  useEffect(() => {
    const hide = () => setSel(null);
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, []);

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

  const chapterNow = useMemo(() => {
    let c: (typeof chapters)[number] | null = null;
    for (const ch of chapters) if (ch.page <= current) c = ch;
    return c;
  }, [chapters, current]);

  if (data.scanned || !textPages.length)
    return (
      <section className="card mx-auto flex max-w-xl flex-col items-center gap-3 p-8 text-center">
        <FileText className="text-primary size-10" />
        <h1 className="text-xl font-semibold">{resource.title}</h1>
        <p className="text-muted text-sm">{t("scanned")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {data.fileId && (
            <Button asChild variant="outline">
              <a href={`/api/files/${data.fileId}`} target="_blank" rel="noopener">
                <ExternalLink /> {t("openPdf")}
              </a>
            </Button>
          )}
          <Button asChild>
            <Link href={`/library/${resource.id}/audiobook`}>
              <Headphones /> {t("listen")}
            </Link>
          </Button>
        </div>
      </section>
    );

  const side = (
    <ReaderSide
      resourceId={resource.id}
      tab={tab}
      setTab={setTab}
      chapters={chapters}
      current={chapterNow}
      preparing={preparing}
      marks={marks}
      pages={textPages}
      onOpen={(p, title) => void openAt(p, title)}
      term={term}
      setTerm={setTerm}
    />
  );
  // Paper: the reading area's own colours (auto = the app's theme).
  const paper = prefs.paper === "auto" ? null : PAPER[prefs.paper];
  const pageTitle = (p: number) =>
    chapters
      .filter((c) => c.page === p)
      .map((c) => c.title)
      .join(" · ");

  return (
    <div
      className="-mx-4 -my-6 min-h-[calc(100dvh-3.5rem)] sm:-mx-6 sm:-my-8"
      style={paper ? { background: paper.bg, color: paper.fg } : undefined}
    >
      {/* Top bar */}
      <div
        className={cn(
          "border-border sticky top-14 z-20 flex items-center gap-1.5 border-b px-3 py-2 backdrop-blur sm:px-5",
          !paper && "bg-background/90",
        )}
        style={paper ? { background: `${paper.bg}e6`, color: paper.fg } : undefined}
      >
        <Link
          href={`/library/${resource.id}`}
          className="hover:bg-surface-2/50 rounded-md p-1.5 opacity-70 hover:opacity-100"
          aria-label={t("back")}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className="hover:bg-surface-2/50 rounded-md p-1.5 opacity-70 hover:opacity-100 lg:hidden"
          aria-label={t("contents")}
        >
          <ListTree className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{resource.title}</p>
          <p className="truncate text-xs opacity-60">
            {chapterNow
              ? `${chapterNow.title}${chapterNow.subtitle ? ` (${chapterNow.subtitle})` : ""} · `
              : ""}
            {t("pageOf", { n: current, total: data.totalPages || last })}
          </p>
        </div>
        <ReaderSettings />
        <Link
          href={`/library/${resource.id}/audiobook`}
          className="hover:bg-surface-2/50 rounded-md p-1.5 opacity-70 hover:opacity-100"
          title={t("listen")}
          aria-label={t("listen")}
        >
          <Headphones className="size-4" />
        </Link>
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
      {/* Reading progress through the whole book */}
      <div className="h-0.5 w-full bg-black/5" aria-hidden>
        <div
          className="bg-primary h-full transition-[width] duration-500"
          style={{
            width: `${Math.min(100, (current / Math.max(1, data.totalPages || last)) * 100)}%`,
          }}
        />
      </div>
      <div className="flex">
        {/* Side panel: always on wide screens (unless the AI needs the room), a drawer on phones */}
        <aside
          className={cn(
            "border-border hidden w-72 shrink-0 border-r",
            ai ? "2xl:block" : "lg:block",
          )}
        >
          <div className="sticky top-[7.5rem] h-[calc(100dvh-8.5rem)] p-3">{side}</div>
        </aside>
        {drawer && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
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
                <p className="text-sm font-semibold">{resource.title}</p>
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
        <div
          ref={main}
          className={cn("min-w-0 flex-1 px-5 pt-6 pb-32 sm:px-10", ai && "lg:mr-[24rem]")}
        >
          <article
            className={cn("mx-auto", prefs.family === "serif" ? "font-serif" : "font-sans")}
            style={{
              fontSize: prefs.size,
              lineHeight: prefs.leading,
              maxWidth: WIDTH[prefs.width],
            }}
            lang="und"
          >
            {(pages[0]?.page ?? 1) > firstPage && (
              <div className="mb-6 text-center font-sans">
                <Button variant="ghost" size="sm" onClick={() => void loadEarlier()}>
                  <ChevronUp /> {t("earlier")}
                </Button>
              </div>
            )}
            {pages.map((p) => (
              <section key={p.page} data-page={p.page} className="scroll-mt-32">
                <div className="my-6 flex items-center gap-3 font-sans text-xs tabular-nums opacity-50 select-none">
                  <span className="h-px flex-1 bg-current opacity-30" /> {p.page}
                  {data.fileId && !p.picture && (
                    <button
                      type="button"
                      onClick={() =>
                        setOriginal((cur) => {
                          const n = new Set(cur);
                          if (n.has(p.page)) n.delete(p.page);
                          else n.add(p.page);
                          return n;
                        })
                      }
                      className="rounded px-1 hover:opacity-100"
                      title={t("originalHint")}
                    >
                      {original.has(p.page) ? t("hideOriginal") : t("original")}
                    </button>
                  )}
                  <span className="h-px flex-1 bg-current opacity-30" />
                </div>
                {data.fileId && (p.picture || original.has(p.page)) && (
                  <figure className="my-4 font-sans">
                    <PdfPage
                      fileId={data.fileId}
                      page={p.page}
                      alt={
                        pageTitle(p.page) ||
                        t("pageOf", { n: p.page, total: data.totalPages || last })
                      }
                    />
                    {p.picture && pageTitle(p.page) && (
                      <figcaption className="mt-2 text-center text-sm opacity-60">
                        {pageTitle(p.page)}
                      </figcaption>
                    )}
                  </figure>
                )}
                {p.paras.map((para, i) =>
                  para.heading ? (
                    <h2
                      key={i}
                      data-para
                      className="mt-8 mb-4 text-center font-sans text-[0.95em] font-semibold tracking-[0.12em] uppercase"
                    >
                      {para.text}
                    </h2>
                  ) : (
                    <p key={i} data-para className="mb-[0.9em] indent-[1.5em]">
                      {marked(para.text, marks, term).map((piece, k) =>
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
                              setMarkMenu({ m: piece.m, x: e.clientX, y: e.clientY });
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
                      )}
                    </p>
                  ),
                )}
              </section>
            ))}
            <div ref={bottom} className="py-10 text-center font-sans">
              {loading ? (
                <Loader2 className="mx-auto size-5 animate-spin opacity-50" />
              ) : (pages.at(-1)?.page ?? 0) >= last ? (
                <p className="text-sm opacity-60">{t("theEnd")}</p>
              ) : null}
            </div>
          </article>
        </div>
        {ai && (
          <aside className="border-border bg-surface text-foreground fixed inset-x-0 top-14 bottom-0 z-30 border-l shadow-xl sm:left-auto sm:w-[24rem] lg:shadow-none">
            <ReaderAi
              resourceId={resource.id}
              page={current}
              ask={ask}
              onClose={() => setAi(false)}
            />
          </aside>
        )}
      </div>

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

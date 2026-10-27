"use client";
import {
  ArrowLeft,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Headphones,
  ListTree,
  Loader2,
  Minus,
  NotebookPen,
  Plus,
  Quote,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { saveNoteAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { reflow, type Para } from "@/lib/reflow";
import type { ReaderData, ReaderMark } from "@/server/reader";
import { PdfPage } from "./pdf-page";
import { ReaderAi, type ReaderAsk } from "./reader-ai";

type Res = { id: string; title: string; authors: string };
type Page = { page: number; paras: Para[]; picture?: boolean };
type Sel = { text: string; page: number; context: string; x: number; y: number };

const BATCH = 8;
const FONT_KEY = "nn:reader-font";
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Text size of the reader (this device). */
function readFont() {
  try {
    const f = Number(localStorage.getItem(FONT_KEY));
    return f >= 15 && f <= 26 ? f : 19;
  } catch {
    return 19;
  }
}
function subscribeFont(cb: () => void) {
  window.addEventListener(FONT_KEY, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(FONT_KEY, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Splits a paragraph at the saved quotes / notes it contains (highlighted). */
function marked(text: string, marks: ReaderMark[]) {
  const ranges: { a: number; b: number; m: ReaderMark }[] = [];
  for (const m of marks) {
    const s = norm(m.text);
    if (s.length < 6) continue;
    let a = text.indexOf(s);
    let b = a >= 0 ? a + s.length : -1;
    if (a < 0 && s.includes(text)) [a, b] = [0, text.length];
    if (a < 0) {
      // A selection over several paragraphs: its start or its end is here.
      const head = s.slice(0, 40);
      const tail = s.slice(-40);
      const h = text.indexOf(head);
      const tl = text.indexOf(tail);
      if (h >= 0 && text.length - h < s.length) [a, b] = [h, text.length];
      else if (tl >= 0 && tl + tail.length < s.length) [a, b] = [0, tl + tail.length];
    }
    if (a >= 0 && b > a && !ranges.some((r) => a < r.b && b > r.a)) ranges.push({ a, b, m });
  }
  if (!ranges.length) return [text];
  ranges.sort((x, y) => x.a - y.a);
  const out: (string | { t: string; m: ReaderMark })[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.a > at) out.push(text.slice(at, r.a));
    out.push({ t: text.slice(r.a, r.b), m: r.m });
    at = r.b;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

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
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(start);
  const [marks, setMarks] = useState<ReaderMark[]>(data.marks);
  const [sel, setSel] = useState<Sel | null>(null);
  const [noteFor, setNoteFor] = useState<Sel | null>(null);
  const [comment, setComment] = useState("");
  const [markMenu, setMarkMenu] = useState<{ m: ReaderMark; x: number; y: number } | null>(null);
  const [toc, setToc] = useState(false);
  const [ai, setAi] = useState(false);
  const [ask, setAsk] = useState<ReaderAsk | null>(null);
  const font = useSyncExternalStore(subscribeFont, readFont, () => 19);
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
  const [original, setOriginal] = useState<Set<number>>(new Set());
  const router = useRouter();
  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [preparing, router]);
  const chapters = useMemo(() => data.structure?.chapters ?? [], [data.structure]);
  const changeFont = (d: number) => {
    try {
      localStorage.setItem(FONT_KEY, String(Math.min(26, Math.max(15, font + d))));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(FONT_KEY));
  };

  const noise = useMemo(() => new Set(data.structure?.noise ?? []), [data.structure]);
  const fetchPages = useCallback(
    async (from: number, to: number): Promise<Page[]> => {
      const r = await fetch(`/api/book/${resource.id}/pages?from=${from}&to=${to}`);
      if (!r.ok) return [];
      const j = (await r.json()) as { pages: { page: number; content: string }[] };
      const got: Page[] = j.pages.map((p) => ({ page: p.page, paras: reflow(p.content, noise) }));
      for (const pic of pictures)
        if (pic >= from && pic <= to && !got.some((g) => g.page === pic))
          got.push({ page: pic, paras: [], picture: true });
      return got.sort((a, b) => a.page - b.page);
    },
    [resource.id, noise, pictures],
  );

  /** Scrolls to `title` on `page` (or to the page itself). */
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
      // Only the window scrolls (scrollIntoView would also shift the app shell).
      if (target)
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 120 });
    });
  }, []);

  /** Opens the book at `page` (and at the chapter title there, if given). */
  const openAt = async (page: number, title?: string) => {
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
    const from = Math.max(1, first - BATCH);
    const got = await fetchPages(from, first - 1);
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
        const el = (
          s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement
        )?.closest<HTMLElement>("[data-page]");
        const para = (
          s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement
        )?.closest<HTMLElement>("[data-para]");
        setSel({
          text: norm(text).slice(0, 4000),
          page: Number(el?.dataset.page ?? current),
          context: norm(para?.textContent ?? "").slice(0, 4000),
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

  const save = async (kind: "quote" | "note", s: Sel, note = "") => {
    const r = await saveNoteAction({
      kind,
      quoteText: s.text.slice(0, 10_000),
      ...(kind === "note"
        ? { body: note.trim() || s.text }
        : note.trim()
          ? { body: note.trim() }
          : {}),
      resourceId: resource.id,
      pageFrom: s.page,
    });
    if (!r.ok) return toast.error(kind === "quote" ? t("quoteFailed") : t("noteFailed"));
    setMarks((m) => [...m, { id: r.data, kind, text: s.text, page: s.page }]);
    window.getSelection()?.removeAllRanges();
    setSel(null);
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

  const tocList = (
    <nav aria-label={t("contents")} className="flex flex-col">
      {chapters.length ? (
        chapters.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setToc(false);
              void openAt(c.page, c.title);
            }}
            className={cn(
              "hover:bg-surface-2 rounded-md px-2 py-1.5 text-left text-sm",
              c.level === 0 && "mt-2 font-semibold",
              chapterNow === c ? "bg-primary-soft text-primary font-medium" : "text-foreground/85",
            )}
          >
            {c.image && (
              <ImageIcon className="mr-1 inline size-3.5 align-[-2px] text-[var(--c-teal)]" />
            )}
            {c.title}
            {c.subtitle && <span className="text-muted ml-1.5 text-xs">· {c.subtitle}</span>}
            <span className="text-muted ml-1.5 text-xs tabular-nums">{c.page}</span>
          </button>
        ))
      ) : preparing ? (
        <p className="text-muted flex items-center gap-1.5 px-2 text-sm">
          <Loader2 className="size-3.5 animate-spin" /> {t("findingContents")}
        </p>
      ) : (
        <p className="text-muted px-2 text-sm">{t("noContents")}</p>
      )}
    </nav>
  );

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 sm:-my-8">
      {/* Top bar */}
      <div className="border-border bg-background/90 sticky top-14 z-20 flex items-center gap-2 border-b px-3 py-2 backdrop-blur sm:px-5">
        <Link
          href={`/library/${resource.id}`}
          className="text-muted hover:text-foreground rounded-md p-1.5"
          aria-label={t("back")}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <button
          type="button"
          onClick={() => setToc((v) => !v)}
          className="text-muted hover:text-foreground hover:bg-surface-2 rounded-md p-1.5 lg:hidden"
          aria-label={t("contents")}
        >
          <ListTree className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{resource.title}</p>
          <p className="text-muted truncate text-xs">
            {chapterNow
              ? `${chapterNow.title}${chapterNow.subtitle ? ` (${chapterNow.subtitle})` : ""} · `
              : ""}
            {t("pageOf", { n: current, total: data.totalPages || last })}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => changeFont(-1)}
            className="text-muted hover:text-foreground hover:bg-surface-2 rounded-md p-1.5"
            aria-label={t("smaller")}
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => changeFont(1)}
            className="text-muted hover:text-foreground hover:bg-surface-2 rounded-md p-1.5"
            aria-label={t("bigger")}
          >
            <Plus className="size-4" />
          </button>
          <Link
            href={`/library/${resource.id}/audiobook`}
            className="text-muted hover:text-foreground hover:bg-surface-2 rounded-md p-1.5"
            title={t("listen")}
            aria-label={t("listen")}
          >
            <Headphones className="size-4" />
          </Link>
          <Button size="sm" variant={ai ? "secondary" : "outline"} onClick={() => setAi((v) => !v)}>
            <Sparkles /> <span className="hidden sm:inline">{t("askAi")}</span>
          </Button>
        </div>
      </div>
      <div className="flex">
        {/* Contents: always on wide screens, a drawer on phones */}
        <aside
          className={cn(
            "border-border hidden w-64 shrink-0 border-r",
            // With the AI panel open the text needs the room.
            ai ? "2xl:block" : "lg:block",
          )}
        >
          <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto p-3">
            <p className="text-muted mb-1 px-2 text-xs font-semibold tracking-wide uppercase">
              {t("contents")}
            </p>
            {tocList}
          </div>
        </aside>
        {toc && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label={t("contents")}>
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              onClick={() => setToc(false)}
              aria-label={t("close")}
            />
            <div className="bg-surface absolute inset-y-0 left-0 w-72 overflow-y-auto p-3 shadow-xl">
              <div className="mb-2 flex items-center">
                <p className="text-sm font-semibold">{t("contents")}</p>
                <button
                  type="button"
                  onClick={() => setToc(false)}
                  className="text-muted ml-auto p-1"
                  aria-label={t("close")}
                >
                  <X className="size-4" />
                </button>
              </div>
              {tocList}
            </div>
          </div>
        )}
        <div
          ref={main}
          className={cn("min-w-0 flex-1 px-4 pt-6 pb-32 sm:px-10", ai && "lg:mr-[24rem]")}
        >
          <article
            className="mx-auto max-w-[40rem] font-serif leading-[1.75]"
            style={{ fontSize: font }}
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
                <div className="text-muted/70 my-6 flex items-center gap-3 font-sans text-xs tabular-nums select-none">
                  <span className="bg-border h-px flex-1" /> {p.page}
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
                      className="hover:text-foreground rounded px-1"
                      title={t("originalHint")}
                    >
                      {original.has(p.page) ? t("hideOriginal") : t("original")}
                    </button>
                  )}
                  <span className="bg-border h-px flex-1" />
                </div>
                {data.fileId && (p.picture || original.has(p.page)) && (
                  <figure className="my-4 font-sans">
                    <PdfPage
                      fileId={data.fileId}
                      page={p.page}
                      alt={
                        chapters
                          .filter((c) => c.page === p.page)
                          .map((c) => c.title)
                          .join(" · ") || t("pageOf", { n: p.page, total: data.totalPages || last })
                      }
                    />
                    {p.picture && chapters.some((c) => c.page === p.page) && (
                      <figcaption className="text-muted mt-2 text-center text-sm">
                        {chapters
                          .filter((c) => c.page === p.page)
                          .map((c) => c.title)
                          .join(" · ")}
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
                      {marked(para.text, marks).map((piece, k) =>
                        typeof piece === "string" ? (
                          piece
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
                <Loader2 className="text-muted mx-auto size-5 animate-spin" />
              ) : (pages.at(-1)?.page ?? 0) >= last ? (
                <p className="text-muted text-sm">{t("theEnd")}</p>
              ) : null}
            </div>
          </article>
        </div>
        {ai && (
          <aside className="border-border bg-surface fixed inset-x-0 top-14 bottom-0 z-30 border-l shadow-xl sm:left-auto sm:w-[24rem] lg:shadow-none">
            <ReaderAi
              resourceId={resource.id}
              page={current}
              ask={ask}
              onClose={() => setAi(false)}
            />
          </aside>
        )}
      </div>

      {/* Selection menu */}
      {sel && !noteFor && (
        <div
          className="border-border bg-surface fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-xl border p-1 font-sans shadow-lg"
          style={{
            left: Math.min(Math.max(sel.x, 160), window.innerWidth - 160),
            top: Math.max(sel.y - 8, 64),
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={() => void save("quote", sel)}
            className="hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm whitespace-nowrap"
            title={t("quoteHint")}
          >
            <Quote className="text-primary size-4" /> {t("quote")}
          </button>
          <button
            type="button"
            onClick={() => {
              setComment("");
              setNoteFor(sel);
            }}
            className="hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm whitespace-nowrap"
            title={t("noteHint")}
          >
            <NotebookPen className="size-4 text-[var(--c-amber)]" /> {t("note")}
          </button>
          <button
            type="button"
            onClick={() => {
              setAsk({ selection: sel.text, context: sel.context, page: sel.page, n: Date.now() });
              setAi(true);
              setSel(null);
            }}
            className="hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm whitespace-nowrap"
          >
            <Sparkles className="text-primary size-4" /> {t("askAi")}
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(sel.text);
              toast.success(t("copied"));
              setSel(null);
            }}
            className="text-muted hover:bg-surface-2 grid size-8 place-items-center rounded-lg"
            aria-label={t("copy")}
          >
            <Copy className="size-4" />
          </button>
        </div>
      )}

      {/* Note with an optional own thought */}
      {noteFor && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-label={t("note")}
        >
          <form
            className="bg-surface flex w-full max-w-md flex-col gap-3 rounded-2xl p-5 shadow-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              void save("note", noteFor, comment).then(() => setNoteFor(null));
            }}
          >
            <p className="flex items-center gap-2 font-semibold">
              <NotebookPen className="size-4 text-[var(--c-amber)]" />{" "}
              {t("noteTitle", { page: noteFor.page })}
            </p>
            <blockquote className="line-clamp-5 border-l-2 border-[var(--c-amber)] pl-3 font-serif text-sm italic">
              {noteFor.text}
            </blockquote>
            <textarea
              autoFocus
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("thought")}
              className="border-border-strong bg-surface rounded-lg border px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNoteFor(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit">{t("save")}</Button>
            </div>
          </form>
        </div>
      )}

      {/* A saved quote / note */}
      {markMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setMarkMenu(null)}>
          <div
            className="border-border bg-surface absolute flex items-center gap-1 rounded-xl border p-1 font-sans text-sm shadow-lg"
            style={{ left: Math.min(markMenu.x, window.innerWidth - 220), top: markMenu.y + 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-muted flex items-center gap-1.5 px-2">
              {markMenu.m.kind === "quote" ? (
                <Quote className="text-primary size-4" />
              ) : (
                <NotebookPen className="size-4 text-[var(--c-amber)]" />
              )}
              {markMenu.m.kind === "quote" ? t("inQuotes") : t("inNotes")}
            </span>
            <a
              href={`/notes/${markMenu.m.id}`}
              target="_blank"
              rel="noopener"
              className="text-primary hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-lg px-2 font-medium"
            >
              <ExternalLink className="size-4" /> {t("open")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

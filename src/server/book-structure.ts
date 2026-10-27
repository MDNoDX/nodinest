/**
 * The structure of a book's PDF, found once when the PDF is added and shared
 * by the reader (Kitobni o'qish) and the audiobook:
 *  - the PDF's own bookmarks (outline), when it has them — the most exact source;
 *  - heading-like lines from the top of every page of the WHOLE book
 *    ("CHAPTER 3", "PROLOGUE", "BRAN", "IKKINCHI BOB"), running headers removed;
 *  - one AI pass that picks the real chapters from those (in order, nothing
 *    invented) and where the actual text starts.
 * Each chapter gets the exact offset of its title line, so reading and
 * listening start right at the title, even in the middle of a page.
 */
import "server-only";
import { Type } from "@google/genai";
import { and, desc, eq } from "drizzle-orm";
import { getDocumentProxy } from "unpdf";
import { db, withUser, type AppContext } from "@/db";
import { bookTextSources } from "@/db/schema";
import { cleanPages, headingCandidates, joinPages, locateHeading } from "@/lib/audiobook-plan";
import { lineKey } from "@/lib/reflow";
import { generate, isAiConfigured } from "./ai/gemini";
import { langRule } from "./ai/study";
import { loadBookPages } from "./booktext";

export type OutlineItem = { title: string; page: number; level: number };
export type Chapter = { title: string; page: number; at: number | null; level: number };
export type Structure = {
  startPage: number;
  chapters: Chapter[];
  /** "pending": being found right now (since `startedAt`). */
  source: "outline" | "ai" | "none" | "pending";
  startedAt?: string;
  /** lineKey()s of running headers / footers / navigation lines to hide while reading. */
  noise?: string[];
};

/** Lines repeated at the top or bottom of many pages (running headers, footers, links). */
export function runningLines(pages: { content: string }[]): string[] {
  const count = new Map<string, number>();
  for (const p of pages) {
    const lines = p.content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const edge = new Set([...lines.slice(0, 3), ...lines.slice(-3)].map(lineKey).filter(Boolean));
    for (const k of edge) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const min = Math.max(6, pages.length * 0.12);
  return [...count.entries()]
    .filter(([k, n]) => n >= min && !/^\d+$/.test(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([k]) => k);
}

/** The PDF's bookmarks with their page numbers (two levels deep). */
export async function pdfOutline(bytes: Uint8Array): Promise<OutlineItem[]> {
  try {
    const pdf = await getDocumentProxy(bytes.slice());
    const top = (await pdf.getOutline()) ?? [];
    const out: OutlineItem[] = [];
    const walk = async (items: typeof top, level: number) => {
      for (const it of items) {
        if (out.length >= 600) return;
        let dest: unknown = it.dest;
        try {
          if (typeof dest === "string") dest = await pdf.getDestination(dest);
          const ref = Array.isArray(dest) ? dest[0] : null;
          const page =
            ref && typeof ref === "object"
              ? (await pdf.getPageIndex(ref as never)) + 1
              : typeof ref === "number"
                ? ref + 1
                : null;
          const title = String(it.title ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200);
          if (page && title) out.push({ title, page, level });
        } catch {
          /* a broken bookmark is skipped */
        }
        if (level < 1 && it.items?.length) await walk(it.items, level + 1);
      }
    };
    await walk(top, 0);
    return out.sort((a, b) => a.page - b.page);
  } catch {
    return [];
  }
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    startPage: { type: Type.INTEGER },
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Clean title, e.g. 'Prologue', 'Bran', 'Chapter 3: …'",
          },
          page: { type: Type.INTEGER },
          line: { type: Type.STRING, description: "The exact heading line from the list, if any" },
          level: { type: Type.INTEGER, description: "0 = part / book, 1 = chapter" },
        },
        required: ["title", "page"],
      },
    },
  },
  required: ["startPage", "chapters"],
};

const norm = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** Finds the chapters of a book once (for its latest ready text source) and stores them. */
export async function findStructure(
  ctx: AppContext,
  resourceId: string,
  locale: "uz" | "en",
): Promise<Structure> {
  const [src] = await withUser(db, ctx, (tx) =>
    tx
      .select({
        id: bookTextSources.id,
        outline: bookTextSources.outline,
        pages: bookTextSources.pages,
      })
      .from(bookTextSources)
      .where(
        and(
          eq(bookTextSources.userId, ctx.userId),
          eq(bookTextSources.resourceId, resourceId),
          eq(bookTextSources.status, "ready"),
        ),
      )
      .orderBy(desc(bookTextSources.createdAt))
      .limit(1),
  );
  if (!src) return { startPage: 1, chapters: [], source: "none" };
  const pending: Structure = {
    startPage: 1,
    chapters: [],
    source: "pending",
    startedAt: new Date().toISOString(),
  };
  await withUser(db, ctx, (tx) =>
    tx.update(bookTextSources).set({ chapters: pending }).where(eq(bookTextSources.id, src.id)),
  );
  // Running headers / footers are found first; everything else uses the clean text
  // (the same text the audiobook plans with), so title offsets match.
  const raw = await loadBookPages(ctx, resourceId);
  const noise = runningLines(raw);
  const pages = cleanPages(raw, noise);
  const { starts } = joinPages(pages);
  const outline = (src.outline as OutlineItem[] | null) ?? [];

  // Heading-like lines; a line found on many pages is a running header, not a chapter.
  const all = headingCandidates(pages, 6000);
  const count = new Map<string, number>();
  for (const c of all) count.set(norm(c.line), (count.get(norm(c.line)) ?? 0) + 1);
  // A running header (book or author name) is on a large share of pages; a
  // chapter title may repeat (a character's name in many novels) but far less.
  const header = Math.max(6, pages.length * 0.12);
  const cands = all.filter((c) => (count.get(norm(c.line)) ?? 0) < header).slice(0, 2500);

  let structure: Structure = { startPage: 1, chapters: [], source: "none" };
  if (isAiConfigured() && (outline.length || cands.length)) {
    try {
      const res = await generate(
        [
          {
            role: "user",
            parts: [
              {
                text: [
                  `TOTAL PAGES: ${src.pages ?? pages.at(-1)?.page ?? "?"}`,
                  outline.length
                    ? `PDF BOOKMARKS (title → page)\n${outline.map((o) => `${"  ".repeat(o.level)}${o.title} → ${o.page}`).join("\n")}`
                    : "PDF BOOKMARKS: none",
                  cands.length
                    ? `HEADING-LIKE LINES AT PAGE TOPS (page | line | what follows)\n${cands.map((c) => `${c.page} | ${c.line} | ${c.next}`).join("\n")}`
                    : "",
                  pages.length
                    ? `FIRST PAGES\n${pages
                        .slice(0, 8)
                        .map((p) => `[p. ${p.page}] ${p.content.slice(0, 500)}`)
                        .join("\n")}`
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
            ],
          },
        ],
        {
          systemInstruction: [
            "You find the table of contents of a book from its PDF. List its real chapters (and parts / books, level 0) in reading order with the page each starts on.",
            "Bookmarks give the most reliable PAGES when present. Their titles may be useless (e.g. every bookmark just repeats the book's title): then take the title from the heading-like line on that page. Without bookmarks use the heading-like lines. In many novels a chapter title is a character's name (e.g. 'BRAN', 'CATELYN') — a chapter, even when the same name returns many times.",
            "Skip: running headers / footers, the table of contents page itself, copyright, dedication, 'also by', maps, publisher's ads, page numbers, and lines that are just emphasis inside the text.",
            "Never invent chapters or pages. 'line' must be copied exactly from the heading-like lines when the chapter was found there.",
            "startPage: the first page of the actual work (prologue / first chapter / author's preface), after the front matter.",
            "Titles: as in the book but in normal capitalisation ('BRAN' → 'Bran', 'CHAPTER ONE' → 'Chapter One'). Keep the book's language.",
            langRule(locale),
          ].join("\n"),
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          thinkingConfig: { thinkingBudget: 2048 },
        },
        { timeoutMs: 120_000, patient: true },
      );
      const raw = JSON.parse(res.text ?? "{}") as {
        startPage?: number;
        chapters?: { title?: string; page?: number; line?: string; level?: number }[];
      };
      const maxPage = Math.max(src.pages ?? 0, pages.at(-1)?.page ?? 0, 1);
      const chapters: Chapter[] = [];
      for (const c of raw.chapters ?? []) {
        const title = String(c.title ?? "")
          .trim()
          .slice(0, 200);
        const page = Math.round(Number(c.page));
        if (!title || !(page >= 1 && page <= maxPage)) continue;
        if (chapters.length && page < chapters.at(-1)!.page) continue; // keep reading order
        const exact = c.line
          ? cands.find((x) => x.line === c.line && Math.abs(x.page - page) <= 1)
          : undefined;
        const at = exact
          ? (starts.find((s) => s.page === exact.page)?.at ?? 0) + exact.at
          : pages.length
            ? locateHeading(pages, starts, page, c.line || title)
            : null;
        chapters.push({ title, page: exact?.page ?? page, at, level: c.level === 0 ? 0 : 1 });
      }
      structure = {
        startPage: Math.min(Math.max(1, Math.round(Number(raw.startPage)) || 1), maxPage),
        chapters,
        source: outline.length ? "outline" : "ai",
      };
    } catch {
      /* fall back to the bookmarks below */
    }
  }
  if (!structure.chapters.length && outline.length) {
    const nested = outline.some((o) => o.level > 0);
    structure = {
      startPage: outline[0].page,
      chapters: outline.map((o) => ({
        title: o.title,
        page: o.page,
        at: pages.length ? locateHeading(pages, starts, o.page, o.title) : null,
        level: nested && o.level === 0 ? 0 : 1,
      })),
      source: "outline",
    };
  }
  structure.noise = noise;
  await withUser(db, ctx, (tx) =>
    tx.update(bookTextSources).set({ chapters: structure }).where(eq(bookTextSources.id, src.id)),
  );
  return structure;
}

/** Not found yet, or a previous attempt was cut off (older than 4 minutes). */
export function needsStructure(s: Structure | null) {
  if (!s) return true;
  return s.source === "pending" && Date.now() - Date.parse(s.startedAt ?? "0") > 4 * 60_000;
}

/** The stored structure (null until it was found). */
export async function getStructure(ctx: AppContext, resourceId: string): Promise<Structure | null> {
  const [src] = await withUser(db, ctx, (tx) =>
    tx
      .select({ chapters: bookTextSources.chapters })
      .from(bookTextSources)
      .where(
        and(
          eq(bookTextSources.userId, ctx.userId),
          eq(bookTextSources.resourceId, resourceId),
          eq(bookTextSources.status, "ready"),
        ),
      )
      .orderBy(desc(bookTextSources.createdAt))
      .limit(1),
  );
  return (src?.chapters as Structure | null) ?? null;
}

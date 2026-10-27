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
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";
import { db, withUser, type AppContext } from "@/db";
import { bookTextSources } from "@/db/schema";
import {
  cleanPages,
  contentsLines,
  headingCandidates,
  joinPages,
  locateHeading,
} from "@/lib/audiobook-plan";
import { lineKey } from "@/lib/reflow";
import { generate, isAiConfigured } from "./ai/gemini";
import { langRule } from "./ai/study";
import { loadBookPages } from "./booktext";
import { readFileBytes } from "./storage";

export type OutlineItem = { title: string; page: number; level: number };
export type Chapter = {
  /** Exactly as the PDF names it (its contents page / bookmarks). */
  title: string;
  /** The title line inside the text when it differs (e.g. "Chapter 1" → "BRAN"). */
  subtitle?: string;
  page: number;
  at: number | null;
  level: number;
  /** The section is a picture page (a map, an illustration, the cover). */
  image?: boolean;
};
export type Structure = {
  startPage: number;
  chapters: Chapter[];
  /** "pending": being found right now (since `startedAt`). */
  source: "outline" | "ai" | "none" | "pending";
  startedAt?: string;
  /** lineKey()s of running headers / footers / navigation lines to hide while reading. */
  noise?: string[];
  /** Pages that hold pictures; `textless` ones are only a picture (maps, cover, plates). */
  images?: { page: number; textless: boolean }[];
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

/** Pages that draw a picture (maps, illustrations, the cover). Fast: no decoding. */
export async function pdfImagePages(bytes: Uint8Array): Promise<number[]> {
  try {
    const { OPS } = await getResolvedPDFJS();
    const kinds = new Set(
      [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].filter(
        (x) => x != null,
      ),
    );
    const pdf = await getDocumentProxy(bytes.slice());
    const out: number[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 3000); i++) {
      const page = await pdf.getPage(i);
      const ops = await page.getOperatorList();
      if (ops.fnArray.some((f) => kinds.has(f))) out.push(i);
      page.cleanup();
    }
    return out;
  } catch {
    return [];
  }
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
            description: "Exactly as on the PDF's contents page / bookmarks",
          },
          subtitle: { type: Type.STRING, description: "The heading inside the text, if different" },
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
        fileId: bookTextSources.fileId,
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
  const toc = contentsLines(raw);
  // Picture pages (maps, plates, the cover) come from the PDF itself.
  const pictures = src.fileId
    ? await readFileBytes(ctx, src.fileId)
        .then((f) => (f ? pdfImagePages(f.bytes) : []))
        .catch(() => [] as number[])
    : [];
  const textLen = new Map(raw.map((p) => [p.page, p.content.replace(/\s/g, "").length]));
  const images = pictures.map((page) => ({ page, textless: (textLen.get(page) ?? 0) < 40 }));

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
                  toc
                    ? `THE PDF'S OWN CONTENTS PAGE (p. ${toc.page})\n${toc.lines.map((l) => l.line).join("\n")}`
                    : "CONTENTS PAGE: none found",
                  images.length
                    ? `PICTURE PAGES (no text = only a picture, e.g. a map or the cover): ${images.map((i) => `${i.page}${i.textless ? " (no text)" : ""}`).join(", ")}`
                    : "",
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
            "You rebuild the table of contents of a book EXACTLY as its PDF has it — the user wants the original division, not yours.",
            "1. If the PDF has its own contents page, it is the authority: every entry, in its order, with its own words (only drop list bullets such as '•' or a stray 'l', dot leaders and page numbers). Groups on it (e.g. 'Maps' with 'The North', 'The South'; 'Part One' with its chapters) become level 0 with their entries at level 1. Include everything it lists — maps, prologue, chapters, epilogue, appendix.",
            "2. Find the page each entry starts on: bookmarks give the most reliable pages (their titles may be useless, e.g. all the same); otherwise the heading-like lines; a map or plate is a picture page.",
            "3. 'subtitle': when the title line inside the text differs from the contents entry (contents 'Chapter 1', text heading 'BRAN'), copy that text heading exactly; 'line' = the exact heading-like line used to place the entry.",
            "Without a contents page: use the bookmarks' titles if they are real titles, else the heading-like lines (in many novels a chapter heading is a character's name, e.g. 'BRAN' — a chapter even when the name returns).",
            "Titles are copied exactly as written (same words, same capitalisation, same language) — never translated, shortened or renamed.",
            "Never invent entries or pages. Skip running headers / footers and lines that are just emphasis inside the text.",
            "startPage: the first page of the actual text to be read (prologue / first chapter / author's preface), after the cover, title, contents and maps.",
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
        chapters?: {
          title?: string;
          subtitle?: string;
          page?: number;
          line?: string;
          level?: number;
        }[];
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
        const where = exact?.page ?? page;
        const pic = images.find((i) => i.page === where);
        const subtitle = String(c.subtitle ?? "")
          .trim()
          .slice(0, 200);
        chapters.push({
          title,
          ...(subtitle && norm(subtitle) !== norm(title) ? { subtitle } : {}),
          page: where,
          at: pic?.textless ? null : at,
          level: c.level === 0 ? 0 : 1,
          ...(pic?.textless ? { image: true } : {}),
        });
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
  structure.images = images;
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

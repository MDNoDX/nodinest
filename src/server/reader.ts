/**
 * Kitobni o'qish: the book's PDF text read inside NodiNote. Pages come from
 * `book_pages`, chapters from the book structure; quotes and notes the user
 * saved while reading are highlighted again; the page reached is kept as the
 * reading progress of the user's Darsxona entry.
 */
import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { bookPages, bookTextSources, learningRecords, notes } from "@/db/schema";
import { getStructure, type Structure } from "./book-structure";

export type ReaderMark = { id: string; kind: "quote" | "note"; text: string; page: number | null };

export type ReaderData = {
  /** Pages with text (in order); empty for a scanned PDF. */
  pages: number[];
  totalPages: number;
  structure: Structure | null;
  fileId: string | null;
  scanned: boolean;
  lastPage: number | null;
  marks: ReaderMark[];
};

export async function getReaderData(
  ctx: AppContext,
  resourceId: string,
): Promise<ReaderData | null> {
  return withUser(db, ctx, async (tx) => {
    const [src] = await tx
      .select({ fileId: bookTextSources.fileId, pages: bookTextSources.pages })
      .from(bookTextSources)
      .where(
        and(
          eq(bookTextSources.userId, ctx.userId),
          eq(bookTextSources.resourceId, resourceId),
          eq(bookTextSources.status, "ready"),
        ),
      )
      .orderBy(desc(bookTextSources.createdAt))
      .limit(1);
    if (!src) return null;
    const pageRows = await tx.execute<{ page: number; len: number }>(sql`
      select page, length(content) as len from nodinest.book_pages
      where user_id = ${ctx.userId} and resource_id = ${resourceId} order by page`);
    const [rec] = await tx
      .select({ page: learningRecords.progressCurrent, unit: learningRecords.progressUnit })
      .from(learningRecords)
      .where(
        and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, resourceId)),
      );
    const markRows = await tx
      .select({ id: notes.id, kind: notes.kind, quote: notes.quoteText, page: notes.pageFrom })
      .from(notes)
      .where(
        and(
          eq(notes.userId, ctx.userId),
          eq(notes.resourceId, resourceId),
          isNull(notes.deletedAt),
          sql`${notes.quoteText} is not null`,
        ),
      )
      .limit(2000);
    const texty = pageRows.filter((p) => Number(p.len) > 80).length;
    const total = Math.max(src.pages ?? 0, pageRows.at(-1)?.page ?? 0);
    return {
      pages: pageRows.map((p) => p.page),
      totalPages: total,
      structure: await getStructure(ctx, resourceId),
      fileId: src.fileId,
      scanned: !!src.fileId && texty < Math.max(1, total) * 0.4,
      lastPage: rec?.unit === "pages" ? rec.page : null,
      marks: markRows.map((m) => ({
        id: m.id,
        kind: m.kind,
        text: m.quote ?? "",
        page: m.page,
      })),
    };
  });
}

/** Up to 15 pages of text from `from`. */
export async function readerPages(ctx: AppContext, resourceId: string, from: number, to: number) {
  const a = Math.max(1, Math.floor(from));
  const b = Math.min(a + 14, Math.max(a, Math.floor(to)));
  return withUser(db, ctx, (tx) =>
    tx
      .select({ page: bookPages.page, content: bookPages.content })
      .from(bookPages)
      .where(
        and(
          eq(bookPages.userId, ctx.userId),
          eq(bookPages.resourceId, resourceId),
          sql`${bookPages.page} between ${a} and ${b}`,
        ),
      )
      .orderBy(bookPages.page),
  );
}

/**
 * The page reached becomes the reading progress (pages) of the user's entry;
 * a planned book becomes "reading" from today.
 */
export async function saveReadingPage(
  ctx: AppContext,
  resourceId: string,
  rawPage: number,
  rawTotal: number,
) {
  const { page, total } = z
    .object({
      page: z.number().int().min(1).max(100_000),
      total: z.number().int().min(1).max(100_000),
    })
    .parse({ page: rawPage, total: rawTotal });
  const now = new Date();
  await withUser(db, ctx, (tx) =>
    tx
      .insert(learningRecords)
      .values({
        userId: ctx.userId,
        resourceId,
        status: "in_progress",
        startedAt: now,
        startedPrecision: "day",
        progressCurrent: page,
        progressTotal: total,
        progressUnit: "pages",
        lastAccessedAt: now,
      })
      .onConflictDoUpdate({
        target: [learningRecords.userId, learningRecords.resourceId],
        set: {
          progressCurrent: page,
          progressTotal: total,
          progressUnit: "pages",
          lastAccessedAt: now,
          status: sql`case when ${learningRecords.status} = 'planned' then 'in_progress'::nodinest.learning_status else ${learningRecords.status} end`,
          startedAt: sql`coalesce(${learningRecords.startedAt}, ${now.toISOString()}::timestamptz)`,
          startedPrecision: sql`coalesce(${learningRecords.startedPrecision}, 'day')`,
        },
      }),
  );
}

/**
 * Full text of a resource for search and the AI: the user's own PDF (Vercel
 * Blob) or a public reading link. Text is stored per page in `book_pages`
 * (private to the owner, RLS) so search results can cite page numbers.
 */
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { extractText } from "unpdf";
import { db, withUser, type AppContext } from "@/db";
import { bookPages, bookTextSources, resources } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { htmlToText } from "@/lib/net/html";
import { safeFetch } from "@/lib/net/safe-fetch";
import { makeSnippet, searchTokens, toPrefixTsQuery, type SnippetPart } from "@/lib/normalize";
import { enforceRateLimit } from "./rate-limit";
import { readFileBytes } from "./storage";

const MAX_PAGES = 3000;
const MAX_PAGE_CHARS = 12_000;

async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const { text } = await extractText(bytes, { mergePages: false });
  return text.slice(0, MAX_PAGES).map((p) =>
    p
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim()
      .slice(0, MAX_PAGE_CHARS),
  );
}

/** Splits long plain text into ~3000-char "pages" for web sources. */
function chunkText(text: string): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length && out.length < MAX_PAGES) {
    let cut = Math.min(rest.length, 3000);
    if (cut < rest.length) {
      const nl = rest.lastIndexOf("\n", cut);
      if (nl > 1500) cut = nl;
    }
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }
  return out;
}

async function storePages(ctx: AppContext, sourceId: string, resourceId: string, pages: string[]) {
  await withUser(db, ctx, async (tx) => {
    await tx.delete(bookPages).where(eq(bookPages.sourceId, sourceId));
    const rows = pages
      .map((content, i) => ({ sourceId, userId: ctx.userId, resourceId, page: i + 1, content }))
      .filter((r) => r.content.length > 0);
    for (let i = 0; i < rows.length; i += 300)
      await tx.insert(bookPages).values(rows.slice(i, i + 300));
    await tx
      .update(bookTextSources)
      .set({ status: "ready", pages: pages.length, error: null })
      .where(eq(bookTextSources.id, sourceId));
  });
}

async function newSource(
  ctx: AppContext,
  resourceId: string,
  v: { kind: "file" | "url"; fileId?: string; url?: string },
) {
  return withUser(db, ctx, async (tx) => {
    const [r] = await tx
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.id, resourceId));
    if (!r) throw new AppError("NOT_FOUND");
    // One text source per kind per resource: replace the previous one.
    await tx
      .delete(bookTextSources)
      .where(
        and(
          eq(bookTextSources.userId, ctx.userId),
          eq(bookTextSources.resourceId, resourceId),
          eq(bookTextSources.kind, v.kind),
        ),
      );
    const [row] = await tx
      .insert(bookTextSources)
      .values({
        userId: ctx.userId,
        resourceId,
        kind: v.kind,
        fileId: v.fileId ?? null,
        url: v.url ?? null,
      })
      .returning({ id: bookTextSources.id });
    return row.id;
  });
}

async function fail(ctx: AppContext, sourceId: string, error: string) {
  await withUser(db, ctx, (tx) =>
    tx
      .update(bookTextSources)
      .set({ status: "failed", error })
      .where(eq(bookTextSources.id, sourceId)),
  );
}

/** Extracts and indexes the user's uploaded PDF. */
export async function indexFromFile(ctx: AppContext, resourceId: string, fileId: string) {
  await enforceRateLimit(db, `index:${ctx.userId}`, 30, 3600);
  const sourceId = await newSource(ctx, resourceId, { kind: "file", fileId });
  try {
    const f = await readFileBytes(ctx, fileId);
    if (!f) throw new AppError("NOT_FOUND");
    if (f.mime !== "application/pdf") throw new AppError("VALIDATION", "only_pdf_indexed");
    const pages = await pdfPages(f.bytes);
    await storePages(ctx, sourceId, resourceId, pages);
    return { pages: pages.length };
  } catch (err) {
    await fail(
      ctx,
      sourceId,
      err instanceof AppError ? (err.message ?? err.code) : "extract_failed",
    );
    throw err instanceof AppError ? err : new AppError("FETCH_FAILED", "extract_failed");
  }
}

/** Fetches a public reading link (PDF or web page) and indexes its text. */
export async function indexFromUrl(ctx: AppContext, resourceId: string, url: string) {
  await enforceRateLimit(db, `index:${ctx.userId}`, 30, 3600);
  const sourceId = await newSource(ctx, resourceId, { kind: "url", url });
  try {
    const res = await safeFetch(url, {
      allowTypes: ["application/pdf"],
      binary: true,
      maxBytes: 60 * 1024 * 1024,
      timeoutMs: 60_000,
      accept: "application/pdf,text/html;q=0.9,text/plain;q=0.8",
    });
    if (res.status >= 400) throw new AppError("FETCH_FAILED", `status_${res.status}`);
    const bytes = res.bytes ?? new Uint8Array();
    const pages =
      res.contentType === "application/pdf"
        ? await pdfPages(bytes)
        : chunkText(
            res.contentType === "text/plain"
              ? new TextDecoder().decode(bytes)
              : htmlToText(new TextDecoder().decode(bytes), 2_000_000),
          );
    await storePages(ctx, sourceId, resourceId, pages);
    return { pages: pages.length };
  } catch (err) {
    await fail(
      ctx,
      sourceId,
      err instanceof AppError ? (err.message ?? err.code) : "extract_failed",
    );
    throw err instanceof AppError ? err : new AppError("FETCH_FAILED", "extract_failed");
  }
}

export async function listTextSources(ctx: AppContext, resourceId: string) {
  return withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(bookTextSources)
      .where(
        and(eq(bookTextSources.userId, ctx.userId), eq(bookTextSources.resourceId, resourceId)),
      )
      .orderBy(desc(bookTextSources.updatedAt)),
  );
}

export type BookHit = { resourceId: string; title: string; page: number; snippet: SnippetPart[] };

/** Full-text search inside the user's indexed books (optionally one book). */
export async function searchBookText(
  ctx: AppContext,
  opts: { query: string; resourceId?: string | null; limit?: number; offset?: number },
): Promise<{ hits: BookHit[]; total: number }> {
  const tokens = searchTokens(opts.query);
  const tsq = toPrefixTsQuery(tokens);
  if (!tsq) return { hits: [], total: 0 };
  const rows = await withUser(db, ctx, (tx) =>
    tx.execute<{
      resource_id: string;
      title: string;
      page: number;
      content: string;
      total: number;
    }>(sql`
      select bp.resource_id, r.title, bp.page, bp.content,
        count(*) over() as total
      from nodinest.book_pages bp join nodinest.resources r on r.id = bp.resource_id
      where bp.user_id = ${ctx.userId} and bp.search @@ to_tsquery('simple', ${tsq})
        ${opts.resourceId ? sql`and bp.resource_id = ${opts.resourceId}` : sql``}
      order by ts_rank(bp.search, to_tsquery('simple', ${tsq})) desc, bp.page asc
      limit ${Math.min(opts.limit ?? 20, 50)} offset ${opts.offset ?? 0}`),
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => ({
      resourceId: r.resource_id,
      title: r.title,
      page: r.page,
      snippet: makeSnippet(r.content, tokens, 160),
    })),
  };
}

/** Raw text of a page range (AI "read pages 10–15"). Max 15 pages. */
export async function readBookPages(ctx: AppContext, resourceId: string, from: number, to: number) {
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

/**
 * Free, key-less public metadata lookups for the AI and the add form:
 *  - Google Books (title, authors, edition year, publisher, pages, ISBN, cover)
 *  - Open Library (first publication year = original date, cover by id)
 *  - Wikipedia (people: summary, dates in text, portrait)
 * All requests go through the SSRF-safe fetcher and are cached for 7 days.
 */
import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiCache } from "@/db/schema";
import { safeFetch } from "@/lib/net/safe-fetch";
import { parseIsbn } from "@/lib/normalize";

const TTL = 7 * 24 * 3600 * 1000;

async function cachedJson<T>(url: string): Promise<T | null> {
  const key = `lookup:${createHash("sha256").update(url).digest("hex")}`;
  const [row] = await db.select().from(aiCache).where(eq(aiCache.key, key));
  if (row && row.expiresAt > new Date()) return row.value as T;
  try {
    const res = await safeFetch(url, {
      accept: "application/json",
      maxBytes: 2_000_000,
      timeoutMs: 10_000,
    });
    if (res.status !== 200) return null;
    const value = JSON.parse(res.body) as T;
    await db
      .insert(aiCache)
      .values({ key, value: value as object, expiresAt: new Date(Date.now() + TTL) })
      .onConflictDoUpdate({
        target: aiCache.key,
        set: { value: value as object, expiresAt: new Date(Date.now() + TTL) },
      });
    return value;
  } catch {
    return null;
  }
}

export type BookCandidate = {
  source: "google" | "openlibrary";
  title: string;
  subtitle: string | null;
  authors: string[];
  editionDate: string | null;
  originalYear: string | null;
  publisher: string | null;
  pageCount: number | null;
  language: string | null;
  isbn13: string | null;
  isbn10: string | null;
  description: string | null;
  coverUrl: string | null;
  infoUrl: string | null;
};

type GoogleVolume = {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    language?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    infoLink?: string;
  };
};

function normDate(v: string | undefined | null): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})(-\d{2})?(-\d{2})?/);
  return m ? m[0] : null;
}

function googleCover(url: string | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/^http:/, "https:")
    .replace("&edge=curl", "")
    .replace("zoom=1", "zoom=2");
}

/** Searches books by free text and/or ISBN; best matches first. */
export async function lookupBooks(
  query: string,
  opts: { isbn?: string | null; limit?: number } = {},
): Promise<BookCandidate[]> {
  const isbn = opts.isbn ? parseIsbn(opts.isbn)?.value : null;
  const q = isbn ? `isbn:${isbn}` : query;
  const limit = Math.min(opts.limit ?? 5, 8);
  const [google, ol] = await Promise.all([
    cachedJson<{ items?: GoogleVolume[] }>(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${limit}&printType=books`,
    ),
    cachedJson<{
      docs?: Array<{
        title?: string;
        author_name?: string[];
        first_publish_year?: number;
        cover_i?: number;
        isbn?: string[];
        number_of_pages_median?: number;
        publisher?: string[];
        key?: string;
        language?: string[];
      }>;
    }>(
      isbn
        ? `https://openlibrary.org/search.json?isbn=${isbn}&limit=3`
        : `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=title,author_name,first_publish_year,cover_i,isbn,number_of_pages_median,publisher,key,language`,
    ),
  ]);
  const olDocs = ol?.docs ?? [];
  const out: BookCandidate[] = [];
  for (const it of google?.items ?? []) {
    const v = it.volumeInfo ?? {};
    if (!v.title) continue;
    const ids = v.industryIdentifiers ?? [];
    const match = olDocs.find((d) => d.title && d.title.toLowerCase() === v.title!.toLowerCase());
    out.push({
      source: "google",
      title: v.title,
      subtitle: v.subtitle ?? null,
      authors: v.authors ?? [],
      editionDate: normDate(v.publishedDate),
      originalYear: match?.first_publish_year ? String(match.first_publish_year) : null,
      publisher: v.publisher ?? null,
      pageCount: v.pageCount ?? match?.number_of_pages_median ?? null,
      language: v.language ?? null,
      isbn13: ids.find((i) => i.type === "ISBN_13")?.identifier ?? null,
      isbn10: ids.find((i) => i.type === "ISBN_10")?.identifier ?? null,
      description: v.description?.replace(/<[^>]+>/g, "").slice(0, 3000) ?? null,
      coverUrl:
        googleCover(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail) ??
        (match?.cover_i ? `https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg` : null),
      infoUrl: v.infoLink ?? null,
    });
  }
  // Open Library results that Google didn't return.
  for (const d of olDocs) {
    if (!d.title || out.some((o) => o.title.toLowerCase() === d.title!.toLowerCase())) continue;
    const isbns = d.isbn ?? [];
    out.push({
      source: "openlibrary",
      title: d.title,
      subtitle: null,
      authors: d.author_name ?? [],
      editionDate: null,
      originalYear: d.first_publish_year ? String(d.first_publish_year) : null,
      publisher: d.publisher?.[0] ?? null,
      pageCount: d.number_of_pages_median ?? null,
      language: d.language?.[0] ?? null,
      isbn13: isbns.find((i) => i.length === 13) ?? null,
      isbn10: isbns.find((i) => i.length === 10) ?? null,
      description: null,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
      infoUrl: d.key ? `https://openlibrary.org${d.key}` : null,
    });
  }
  return out.slice(0, limit);
}

export type PersonCandidate = {
  title: string;
  description: string | null;
  extract: string | null;
  imageUrl: string | null;
  url: string;
  lang: string;
};

/** Wikipedia people lookup (uz → en fallback). */
export async function lookupPerson(
  name: string,
  lang: "uz" | "en" = "uz",
): Promise<PersonCandidate[]> {
  const langs = lang === "uz" ? ["uz", "en"] : ["en", "uz"];
  for (const l of langs) {
    const search = await cachedJson<{
      pages?: Array<{ key: string; title: string; description?: string }>;
    }>(
      `https://${l}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(name)}&limit=3`,
    );
    const pages = search?.pages ?? [];
    if (!pages.length) continue;
    const out: PersonCandidate[] = [];
    for (const p of pages.slice(0, 3)) {
      const sum = await cachedJson<{
        title?: string;
        description?: string;
        extract?: string;
        originalimage?: { source?: string };
        thumbnail?: { source?: string };
        content_urls?: { desktop?: { page?: string } };
      }>(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`);
      if (!sum?.title) continue;
      out.push({
        title: sum.title,
        description: sum.description ?? p.description ?? null,
        extract: sum.extract?.slice(0, 2500) ?? null,
        imageUrl: sum.originalimage?.source ?? sum.thumbnail?.source ?? null,
        url:
          sum.content_urls?.desktop?.page ??
          `https://${l}.wikipedia.org/wiki/${encodeURIComponent(p.key)}`,
        lang: l,
      });
    }
    if (out.length) return out;
  }
  return [];
}

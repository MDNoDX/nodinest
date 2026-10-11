/**
 * Imports metadata from a public URL WITHOUT AI: YouTube oEmbed, Wikipedia
 * REST summaries, OpenGraph/JSON-LD for everything else. The AI layer may
 * enrich this, but URL import keeps working when Gemini is unavailable.
 * Results are cached (public, non-sensitive data only).
 */
import "server-only";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiCache } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { extractMeta, htmlToText, robotsAllows } from "@/lib/net/html";
import { checkPublicUrl } from "@/lib/net/ip";
import { safeFetch } from "@/lib/net/safe-fetch";
import { enforceRateLimit } from "./rate-limit";

export type ImportedMetadata = {
  url: string;
  kind: "youtube" | "wikipedia" | "web";
  suggestedType: "video" | "book" | "article" | "person" | "other";
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  author: string | null;
  channel: string | null;
  isbn: string | null;
  publishedDate: string | null;
  durationSeconds: number | null;
  youtubeId: string | null;
  /** Plain text of the page, for AI extraction (truncated). */
  text: string;
  truncated: boolean;
  fetchedAt: string;
};

const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

export function youtubeIdFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be")
      return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (host === "youtube.com" || host === "music.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/);
      return m ? m[2] : null;
    }
  } catch {
    /* invalid */
  }
  return null;
}

function cacheKey(url: string) {
  return `url:${createHash("sha256").update(url).digest("hex")}`;
}

async function readCache<T>(key: string): Promise<T | null> {
  const [row] = await db.select().from(aiCache).where(eq(aiCache.key, key));
  if (!row || row.expiresAt < new Date()) return null;
  return row.value as T;
}

async function writeCache(key: string, value: unknown, ttlMs = CACHE_TTL_MS) {
  const expiresAt = new Date(Date.now() + ttlMs);
  await db
    .insert(aiCache)
    .values({ key, value, expiresAt })
    .onConflictDoUpdate({ target: aiCache.key, set: { value, expiresAt } });
}

async function robotsPermit(url: URL): Promise<boolean> {
  const key = `robots:${url.origin}`;
  const cached = await readCache<{ txt: string }>(key);
  let txt = cached?.txt;
  if (txt === undefined) {
    try {
      const res = await safeFetch(`${url.origin}/robots.txt`, {
        maxBytes: 200_000,
        timeoutMs: 5000,
        accept: "text/plain",
      });
      txt = res.status === 200 ? res.body : "";
    } catch {
      txt = "";
    }
    await writeCache(key, { txt }, 24 * 3600 * 1000);
  }
  return robotsAllows(txt, url.pathname + url.search);
}

function parseIsoDuration(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!m) return null;
  const s =
    Number(m[1] ?? 0) * 86400 +
    Number(m[2] ?? 0) * 3600 +
    Number(m[3] ?? 0) * 60 +
    Number(m[4] ?? 0);
  return s > 0 ? Math.round(s) : null;
}

export async function importUrlMetadata(rawUrl: string, userId: string): Promise<ImportedMetadata> {
  const check = checkPublicUrl(rawUrl.trim());
  if (!check.ok) throw new AppError("URL_BLOCKED", check.reason);
  const url = check.url;
  url.hash = "";
  const key = cacheKey(url.toString());
  const cached = await readCache<ImportedMetadata>(key);
  if (cached) return cached;

  await enforceRateLimit(db, `urlimport:${userId}`, 20, 3600);
  await enforceRateLimit(db, `urlhost:${url.hostname}`, 30, 60);

  const base: ImportedMetadata = {
    url: url.toString(),
    kind: "web",
    suggestedType: "other",
    title: null,
    description: null,
    image: null,
    siteName: null,
    author: null,
    channel: null,
    isbn: null,
    publishedDate: null,
    durationSeconds: null,
    youtubeId: null,
    text: "",
    truncated: false,
    fetchedAt: new Date().toISOString(),
  };

  const ytId = youtubeIdFromUrl(url.toString());
  let result: ImportedMetadata;
  if (ytId) {
    const canonical = `https://www.youtube.com/watch?v=${ytId}`;
    const res = await safeFetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonical)}`,
      { accept: "application/json", maxBytes: 100_000 },
    );
    if (res.status !== 200) throw new AppError("FETCH_FAILED", `status_${res.status}`);
    const data = JSON.parse(res.body) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    result = {
      ...base,
      url: canonical,
      kind: "youtube",
      suggestedType: "video",
      title: data.title?.slice(0, 400) ?? null,
      channel: data.author_name?.slice(0, 200) ?? null,
      siteName: "YouTube",
      image: data.thumbnail_url ?? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      youtubeId: ytId,
    };
  } else if (/(^|\.)wikipedia\.org$/.test(url.hostname) && url.pathname.startsWith("/wiki/")) {
    const title = url.pathname.slice("/wiki/".length);
    const res = await safeFetch(`${url.origin}/api/rest_v1/page/summary/${title}`, {
      accept: "application/json",
      maxBytes: 300_000,
    });
    if (res.status !== 200) throw new AppError("FETCH_FAILED", `status_${res.status}`);
    const data = JSON.parse(res.body) as {
      title?: string;
      description?: string;
      extract?: string;
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    };
    // Full article text for richer AI extraction (best-effort).
    let text = data.extract ?? "";
    try {
      const page = await safeFetch(url.toString(), { maxBytes: 1_000_000 });
      if (page.status === 200) text = htmlToText(page.body, 25_000);
    } catch {
      /* summary is enough */
    }
    result = {
      ...base,
      kind: "wikipedia",
      suggestedType: "person",
      title: data.title ?? null,
      description:
        [data.description, data.extract].filter(Boolean).join(" — ").slice(0, 2000) || null,
      image: data.originalimage?.source ?? data.thumbnail?.source ?? null,
      siteName: "Wikipedia",
      text,
    };
  } else {
    if (!(await robotsPermit(url))) throw new AppError("URL_BLOCKED", "robots");
    const res = await safeFetch(url.toString());
    if (res.status >= 400) throw new AppError("FETCH_FAILED", `status_${res.status}`);
    if (res.contentType === "application/json" || res.contentType === "text/plain") {
      result = { ...base, url: res.url, text: res.body.slice(0, 30_000), truncated: res.truncated };
    } else {
      const meta = extractMeta(res.body, res.url);
      let suggestedType: ImportedMetadata["suggestedType"] =
        meta.ogType === "book" || meta.isbn
          ? "book"
          : meta.ogType?.startsWith("video")
            ? "video"
            : meta.ogType === "article"
              ? "article"
              : "other";
      let durationSeconds: number | null = null;
      let author = meta.author;
      let publishedDate = meta.publishedTime?.slice(0, 10) ?? null;
      for (const item of meta.jsonLd as Array<Record<string, unknown>>) {
        const t = String(item?.["@type"] ?? "");
        if (t === "Book") suggestedType = "book";
        if (t === "VideoObject") {
          suggestedType = "video";
          durationSeconds = parseIsoDuration(item.duration);
        }
        if (t === "Person") suggestedType = "person";
        if (/Article/.test(t) && suggestedType === "other") suggestedType = "article";
        const a = item.author as { name?: string } | Array<{ name?: string }> | undefined;
        const name = Array.isArray(a) ? a[0]?.name : a?.name;
        if (!author && typeof name === "string") author = name.slice(0, 200);
        if (!publishedDate && typeof item.datePublished === "string")
          publishedDate = item.datePublished.slice(0, 10);
      }
      result = {
        ...base,
        url: meta.canonical ?? res.url,
        suggestedType,
        title: meta.title,
        description: meta.description,
        image: meta.image,
        siteName: meta.siteName,
        author,
        isbn: meta.isbn,
        publishedDate:
          publishedDate && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(publishedDate) ? publishedDate : null,
        durationSeconds,
        text: htmlToText(res.body),
        truncated: res.truncated,
      };
    }
  }
  await writeCache(key, result);
  // Occasionally prune expired cache rows.
  if (Math.random() < 0.05)
    await db.execute(sql`delete from nodinest.ai_cache where expires_at < now()`);
  return result;
}

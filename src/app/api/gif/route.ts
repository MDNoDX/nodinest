import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { enforceRateLimit } from "@/server/rate-limit";
import { apiError, apiUser, json } from "../_utils";

type Gif = { id: string; url: string; still?: string | undefined; w: number; h: number };
type KlipySize = Record<
  string,
  { url?: string; width?: string | number; height?: string | number }
>;
type KlipyItem = {
  id: number | string;
  slug: string;
  type?: string;
  file?: Record<string, KlipySize>;
};
type Giphy = {
  id: string;
  images: Record<string, { url?: string; webp?: string; width?: string; height?: string }>;
};

/**
 * GIFs and stickers for chats and comments: /api/gif?q=…&kind=gifs|stickers
 * (trending without q). KLIPY when KLIPY_API_KEY is set (GIPHY_API_KEY as the
 * other choice); the key stays on the server. Without either, the picker says
 * GIFs are not connected yet.
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const klipy = process.env.KLIPY_API_KEY;
    const giphy = process.env.GIPHY_API_KEY;
    if (!klipy && !giphy) return json({ available: false, items: [] });
    await enforceRateLimit(db, `gif:${ctx.userId}`, 120, 3600);
    const p = req.nextUrl.searchParams;
    const q = z
      .string()
      .trim()
      .max(60)
      .parse(p.get("q") ?? "");
    const kind = p.get("kind") === "stickers" ? "stickers" : "gifs";
    const items = klipy
      ? await fromKlipy(klipy, kind, q, ctx.userId)
      : await fromGiphy(giphy!, kind, q);
    return json({ available: true, provider: klipy ? "KLIPY" : "GIPHY", items });
  } catch (err) {
    return apiError(err);
  }
}

async function fromKlipy(key: string, kind: string, q: string, userId: string): Promise<Gif[]> {
  const url = new URL(
    `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/${kind}/${q ? "search" : "trending"}`,
  );
  url.searchParams.set("per_page", "24");
  url.searchParams.set("page", "1");
  // KLIPY wants a per-user id for its history; a one-way hash, never the real id.
  url.searchParams.set(
    "customer_id",
    createHash("sha256").update(`nn:${userId}`).digest("hex").slice(0, 24),
  );
  url.searchParams.set("locale", "uz");
  url.searchParams.set("content_filter", "medium");
  if (q) url.searchParams.set("q", q);
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return [];
  const body = (await r.json().catch(() => null)) as { data?: { data?: KlipyItem[] } } | null;
  return (body?.data?.data ?? [])
    .filter((g) => g.type !== "ad" && g.file)
    .map((g): Gif | null => {
      // A message shows the middle size; the picker its small still first.
      const md = g.file!.md ?? g.file!.sm ?? g.file!.hd;
      const pic = md?.webp ?? md?.gif;
      const still = g.file!.sm?.jpg ?? g.file!.xs?.jpg;
      if (!pic?.url) return null;
      return {
        id: String(g.slug || g.id).slice(0, 40),
        url: pic.url,
        still: still?.url,
        w: Number(pic.width) || 200,
        h: Number(pic.height) || 200,
      };
    })
    .filter((g): g is Gif => !!g);
}

async function fromGiphy(key: string, kind: string, q: string): Promise<Gif[]> {
  const url = new URL(`https://api.giphy.com/v1/${kind}/${q ? "search" : "trending"}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "pg");
  if (q) url.searchParams.set("q", q);
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return [];
  const data = ((await r.json()) as { data?: Giphy[] }).data ?? [];
  return data
    .map((g): Gif | null => {
      const im = g.images.fixed_height ?? g.images.downsized;
      const src = im?.webp || im?.url;
      if (!src) return null;
      return {
        id: g.id,
        url: src.split("?")[0],
        still: g.images.fixed_height_still?.url?.split("?")[0],
        w: Number(im.width) || 200,
        h: Number(im.height) || 200,
      };
    })
    .filter((g): g is Gif => !!g);
}

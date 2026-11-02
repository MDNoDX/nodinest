import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { enforceRateLimit } from "@/server/rate-limit";
import { apiError, apiUser, json } from "../_utils";

type Giphy = {
  id: string;
  images: Record<string, { url?: string; webp?: string; width?: string; height?: string }>;
};

/**
 * GIFs and stickers from GIPHY for chats and comments: /api/gif?q=…&kind=gifs|stickers
 * (trending without q). The key stays on the server (GIPHY_API_KEY); without it the
 * picker says GIFs are not connected yet.
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const key = process.env.GIPHY_API_KEY;
    if (!key) return json({ available: false, items: [] });
    await enforceRateLimit(db, `gif:${ctx.userId}`, 120, 3600);
    const p = req.nextUrl.searchParams;
    const q = z.string().trim().max(60).parse(p.get("q") ?? "");
    const kind = p.get("kind") === "stickers" ? "stickers" : "gifs";
    const offset = z.coerce.number().int().min(0).max(500).parse(p.get("offset") ?? "0");
    const url = new URL(`https://api.giphy.com/v1/${kind}/${q ? "search" : "trending"}`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("limit", "24");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("rating", "pg");
    if (q) url.searchParams.set("q", q);
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!r?.ok) return json({ available: true, items: [] });
    const data = ((await r.json()) as { data?: Giphy[] }).data ?? [];
    const items = data
      .map((g) => {
        const im = g.images.fixed_height ?? g.images.downsized;
        const still = g.images.fixed_height_still?.url;
        const src = im?.webp || im?.url;
        if (!src) return null;
        return {
          id: g.id,
          // Without the tracking query: only GIPHY's own media host is kept.
          url: src.split("?")[0],
          still: still?.split("?")[0],
          w: Number(im.width) || 200,
          h: Number(im.height) || 200,
        };
      })
      .filter(Boolean);
    return json({ available: true, items });
  } catch (err) {
    return apiError(err);
  }
}

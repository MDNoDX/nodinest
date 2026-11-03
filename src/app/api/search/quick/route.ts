import type { NextRequest } from "next/server";
import { db } from "@/db";
import { enforceRateLimit } from "@/server/rate-limit";
import { quickSearch } from "@/server/search";
import { MEDIA_KINDS, searchMedia, searchPeople, type MediaKind } from "@/server/social";
import { apiError, apiUser, json } from "../../_utils";

const SCOPES = ["all", "library", "people", "media"] as const;
type Scope = (typeof SCOPES)[number];

/**
 * The search at the top: `scope` = all (people, posts and my Darsxona),
 * library (my own things), people, or media (what others posted, optionally
 * one `kind`; with a kind and no words, the newest of that kind).
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const p = req.nextUrl.searchParams;
    const q = (p.get("q") ?? "").slice(0, 200);
    const s = p.get("scope") ?? "all";
    const scope: Scope = (SCOPES as readonly string[]).includes(s) ? (s as Scope) : "all";
    const k = p.get("kind") ?? "";
    const kind = k in MEDIA_KINDS ? (k as MediaKind) : null;
    if (!q.trim() && !(scope === "media" && kind)) return json({ items: [] });

    const wants = (x: Scope) => scope === "all" || scope === x;
    if (wants("media")) await enforceRateLimit(db, `mediasearch:${ctx.userId}`, 900, 3600);
    const [people, posts, mine] = await Promise.all([
      wants("people") && q.trim() ? searchPeople(ctx, q).catch(() => []) : [],
      wants("media") ? searchMedia(ctx, q, scope === "media" ? kind : null).catch(() => []) : [],
      wants("library") ? quickSearch(db, ctx, q) : [],
    ]);
    const users = people.slice(0, scope === "people" ? 12 : 4).map((x) => ({
      group: "users",
      id: x.id,
      href: `/u/${x.username}`,
      title: x.name,
      subtitle: `@${x.username}`,
      kind: null,
      premium: x.premium,
      image: x.image,
    }));
    const media = posts.map((x) => ({
      group: "media",
      id: `${x.username}-${x.resourceId}`,
      href: `/u/${x.username}/item/${x.resourceId}`,
      title: x.title,
      subtitle: `${x.name} · @${x.username}`,
      kind: x.type,
      coverUrl: x.coverUrl,
      coverFileId: x.coverFileId,
    }));
    return json({ items: [...users, ...media.slice(0, scope === "all" ? 4 : 24), ...mine] });
  } catch (err) {
    return apiError(err);
  }
}

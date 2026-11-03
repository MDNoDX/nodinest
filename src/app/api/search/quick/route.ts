import type { NextRequest } from "next/server";
import { db } from "@/db";
import { enforceRateLimit } from "@/server/rate-limit";
import { quickSearch } from "@/server/search";
import { MEDIA_KINDS, searchMedia, searchPeople, type MediaKind } from "@/server/social";
import { apiError, apiUser, json } from "../../_utils";

/**
 * The search at the top. `in` lists where to look (comma-separated): library
 * (my own things), people, and kinds of posts others made (book, video,
 * podcast, course, document). None = everywhere. Kinds with no words list
 * their newest posts.
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const p = req.nextUrl.searchParams;
    const q = (p.get("q") ?? "").slice(0, 200);
    const wanted = new Set((p.get("in") ?? "").split(",").filter(Boolean));
    const kinds = [...wanted].filter((k): k is MediaKind => k in MEDIA_KINDS);
    const all = !wanted.size;
    const library = all || wanted.has("library");
    const people = all || wanted.has("people");
    const media = all || kinds.length > 0;
    const words = !!q.trim();
    // Darsxona narrowed to one kind of my own things.
    const LIB: Record<string, string> = {
      book: "book",
      video: "video",
      podcast: "podcast",
      course: "course",
      document: "article",
    };
    const libType = LIB[p.get("lib") ?? ""] ?? null;
    if (!words && !(kinds.length && !library && !people)) return json({ items: [] });

    if (media) await enforceRateLimit(db, `mediasearch:${ctx.userId}`, 900, 3600);
    const [found, posts, mine] = await Promise.all([
      people && words ? searchPeople(ctx, q).catch(() => []) : [],
      media ? searchMedia(ctx, q, kinds.length ? kinds : null).catch(() => []) : [],
      library && words ? quickSearch(db, ctx, q, libType) : [],
    ]);
    // Only one place asked for: more of it.
    const lone = wanted.size === 1 || (kinds.length === wanted.size && !all);
    const users = found.slice(0, lone && people ? 12 : 4).map((x) => ({
      group: "users",
      id: x.id,
      href: `/u/${x.username}`,
      title: x.name,
      subtitle: `@${x.username}`,
      kind: null,
      premium: x.premium,
      image: x.image,
    }));
    const shown = posts.slice(0, all ? 4 : 24).map((x) => ({
      group: "media",
      id: `${x.username}-${x.resourceId}`,
      href: `/u/${x.username}/item/${x.resourceId}`,
      title: x.title,
      subtitle: `${x.name} · @${x.username}`,
      kind: x.type,
      coverUrl: x.coverUrl,
      coverFileId: x.coverFileId,
    }));
    return json({ items: [...users, ...shown, ...mine] });
  } catch (err) {
    return apiError(err);
  }
}

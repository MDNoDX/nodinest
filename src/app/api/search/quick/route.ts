import type { NextRequest } from "next/server";
import { db } from "@/db";
import { quickSearch } from "@/server/search";
import { searchPeople } from "@/server/social";
import { apiError, apiUser, json } from "../../_utils";

export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
    if (!q.trim()) return json({ items: [] });
    // People on the site (public profiles) first, then my own things.
    const [people, mine] = await Promise.all([
      searchPeople(ctx, q).catch(() => []),
      quickSearch(db, ctx, q),
    ]);
    const users = people.slice(0, 5).map((p) => ({
      group: "users",
      id: p.id,
      href: `/u/${p.username}`,
      title: p.name,
      subtitle: `@${p.username}`,
      kind: null,
      premium: p.premium,
      image: p.image,
    }));
    return json({ items: [...users, ...mine] });
  } catch (err) {
    return apiError(err);
  }
}

import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { AppError } from "@/lib/errors";
import { BUNDLE_KINDS, buildBundle } from "@/server/export/bundle";
import { loadExport } from "@/server/export/data";
import { labels } from "@/server/export/labels";
import { getOwnBook } from "@/server/own-books";
import { enforceRateLimit } from "@/server/rate-limit";
import { apiError, apiUser, json } from "../../../_utils";
import { asLocale } from "@/i18n/config";

export const runtime = "nodejs";

/**
 * Manifest of a write-up / own book with its media:
 * /api/export/bundle/{resourceId}?kind=zip|epub. The browser packs the archive.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, ctx } = await apiUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const kind = z.enum(BUNDLE_KINDS).parse(req.nextUrl.searchParams.get("kind") ?? "zip");
    await enforceRateLimit(db, `export:${user.id}`, 40, 3600);
    const loc = asLocale(user.locale);
    const [item] = await loadExport(ctx, { resourceIds: [id], covers: false });
    if (!item?.doc) throw new AppError("NOT_FOUND", "nothing_to_export");
    const own = await getOwnBook(ctx, id);
    const it = own ? { ...item, docLabel: labels(loc).book, authors: user.name } : item;
    return json(
      await buildBundle(ctx, it, { kind, loc, timeZone: user.timezone, owner: user.name }),
    );
  } catch (err) {
    return apiError(err);
  }
}

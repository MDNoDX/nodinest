import type { NextRequest } from "next/server";
import { db, withUser } from "@/db";
import { searchResourcesQuick } from "@/server/catalog";
import { apiError, apiUser, json } from "../../_utils";

export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
    const items = q.trim() ? await withUser(db, ctx, (tx) => searchResourcesQuick(tx, q, 8)) : [];
    return json({ items });
  } catch (err) {
    return apiError(err);
  }
}

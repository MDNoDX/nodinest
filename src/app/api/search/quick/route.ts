import type { NextRequest } from "next/server";
import { db } from "@/db";
import { quickSearch } from "@/server/search";
import { apiError, apiUser, json } from "../../_utils";

export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
    return json({ items: q.trim() ? await quickSearch(db, ctx, q) : [] });
  } catch (err) {
    return apiError(err);
  }
}

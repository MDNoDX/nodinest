import type { NextRequest } from "next/server";
import { db, withUser } from "@/db";
import { searchPeople } from "@/server/catalog";
import { apiError, apiUser, json } from "../../_utils";

export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
    const hits = q.trim() ? await withUser(db, ctx, (tx) => searchPeople(tx, q, 8)) : [];
    return json({ items: hits });
  } catch (err) {
    return apiError(err);
  }
}

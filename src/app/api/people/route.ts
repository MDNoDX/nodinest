import type { NextRequest } from "next/server";
import { searchPeople } from "@/server/social";
import { apiError, apiUser, json } from "../_utils";

/** Live people search: /api/people?q=… (public profiles only). */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
    return json({ people: await searchPeople(ctx, q) });
  } catch (err) {
    return apiError(err);
  }
}

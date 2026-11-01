import { NextResponse } from "next/server";
import { getCustomIcons } from "@/server/custom-icons";
import { apiError, apiUser } from "../_utils";

/** The icons the owner added: what the picker and the guess from a title need. */
export async function GET() {
  try {
    await apiUser();
    const list = await getCustomIcons();
    return NextResponse.json(list.map(({ id, name, words }) => ({ id, name, words })));
  } catch (err) {
    return apiError(err);
  }
}

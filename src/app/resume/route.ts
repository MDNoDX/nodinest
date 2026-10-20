import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { lastResume } from "@/server/resume";

export const dynamic = "force-dynamic";

/** After sign-in: open the taqriz / resource where the user stopped last time. */
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  const to = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));
  if (!u) return to("/login");
  const last = await lastResume(db, { userId: u.id, role: u.role }).catch(() => null);
  if (!last) return to("/");
  return to(
    last.place === "resource"
      ? `/library/${last.resourceId}`
      : `/library/${last.resourceId}/taqriz`,
  );
}

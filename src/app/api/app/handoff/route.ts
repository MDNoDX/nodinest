import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { redeemHandoff } from "@/server/app-handoff";
import { hitRateLimit } from "@/server/rate-limit";

/** The Mac app opens this once with the code from /app-login. */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!(await hitRateLimit(db, `handoff:${ip}`, 20, 600)).allowed)
    return new NextResponse("Too many attempts", { status: 429 });
  const pair = await redeemHandoff(req.nextUrl.searchParams.get("code") ?? "");
  const res = NextResponse.redirect(new URL(pair ? "/" : "/login", req.url), 303);
  res.headers.set("cache-control", "no-store");
  if (pair) {
    const i = pair.indexOf("=");
    const name = pair.slice(0, i);
    res.cookies.set(name, pair.slice(i + 1), {
      httpOnly: true,
      secure: name.startsWith("__Secure-"),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

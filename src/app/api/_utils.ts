import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { GUEST } from "@/lib/page";
import { db } from "@/db";
import { getCurrentUser, toCtx } from "@/lib/auth/session";
import { enforceRateLimit } from "@/server/rate-limit";
import { AppError, toActionError } from "@/lib/errors";

/** A route a guest may use too (public covers, people search): the user or the guest context. */
export async function apiUserOrGuest() {
  const u = await getCurrentUser();
  if (!u) {
    // Guests are counted by address.
    const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
    await enforceRateLimit(db, `guest:${ip}`, 240, 60);
    return { user: null, ctx: GUEST };
  }
  await enforceRateLimit(db, `api:${u.id}`, 240, 60);
  return { user: u, ctx: toCtx(u) };
}

export async function apiUser() {
  const u = await getCurrentUser();
  if (!u) throw new AppError("UNAUTHENTICATED");
  await enforceRateLimit(db, `api:${u.id}`, 240, 60);
  return { user: u, ctx: toCtx(u) };
}

export function apiError(err: unknown) {
  const e = toActionError(err);
  const status =
    e.code === "UNAUTHENTICATED"
      ? 401
      : e.code === "FORBIDDEN"
        ? 403
        : e.code === "NOT_FOUND"
          ? 404
          : e.code === "RATE_LIMITED"
            ? 429
            : e.code === "VALIDATION" || e.code === "INDECENT"
              ? 400
              : 500;
  return NextResponse.json(
    { error: e.code, premium: e.details?.premium },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export function json(data: unknown) {
  return NextResponse.json(data, { headers: { "cache-control": "private, no-store" } });
}

import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/server/rate-limit";
import { AppError, toActionError } from "@/lib/errors";

export async function apiUser() {
  const u = await getCurrentUser();
  if (!u) throw new AppError("UNAUTHENTICATED");
  await enforceRateLimit(db, `api:${u.id}`, 240, 60);
  return { user: u, ctx: { userId: u.id, role: u.role } as const };
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
            : e.code === "VALIDATION"
              ? 400
              : 500;
  return NextResponse.json({ error: e.code }, { status, headers: { "cache-control": "no-store" } });
}

export function json(data: unknown) {
  return NextResponse.json(data, { headers: { "cache-control": "private, no-store" } });
}

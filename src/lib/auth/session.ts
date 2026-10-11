/**
 * Data Access Layer for the current user. Role and status are always re-read
 * from the database — never trusted from a cookie or the client.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, type AppContext } from "@/db";
import { user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { auth } from "./config";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "user" | "superadmin";
  locale: string;
  timezone: string;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [u] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      status: user.status,
      locale: user.locale,
      timezone: user.timezone,
    })
    .from(user)
    .where(eq(user.id, s.user.id));
  if (!u || u.status !== "active") return null;
  const { status: _status, ...rest } = u;
  void _status;
  return rest;
});

/** For pages/layouts: redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireSuperadminPage(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "superadmin") redirect("/");
  return u;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireActor(): Promise<{ user: CurrentUser; ctx: AppContext }> {
  const u = await getCurrentUser();
  if (!u) throw new AppError("UNAUTHENTICATED");
  return { user: u, ctx: { userId: u.id, role: u.role } };
}

export async function requireSuperadminActor(): Promise<{ user: CurrentUser; ctx: AppContext }> {
  const a = await requireActor();
  if (a.user.role !== "superadmin") throw new AppError("FORBIDDEN");
  return a;
}

export function toCtx(u: CurrentUser): AppContext {
  return { userId: u.id, role: u.role };
}

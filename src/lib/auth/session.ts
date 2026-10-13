/**
 * Data Access Layer for the current user. Role and status are always re-read
 * from the database — never trusted from a cookie or the client.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, type AppContext } from "@/db";
import { user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { auth } from "./config";

export const ADMIN_MODE_COOKIE = "nn_admin_mode";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /**
   * EFFECTIVE role. A superadmin account works as a regular user until it
   * switches "admin mode" on (cookie); only then is this "superadmin".
   */
  role: "user" | "superadmin";
  /** The account itself is a superadmin (DB role), regardless of the mode. */
  isSuperadmin: boolean;
  adminMode: boolean;
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
  const { status: _status, role, ...rest } = u;
  void _status;
  const isSuperadmin = role === "superadmin";
  // The cookie can only *narrow* privileges: it never grants a role the DB
  // didn't, so it is safe to read from the client.
  const adminMode = isSuperadmin && (await cookies()).get(ADMIN_MODE_COOKIE)?.value === "1";
  return { ...rest, role: adminMode ? "superadmin" : "user", isSuperadmin, adminMode };
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
  return { user: u, ctx: toCtx(u) };
}

export async function requireSuperadminActor(): Promise<{ user: CurrentUser; ctx: AppContext }> {
  const a = await requireActor();
  if (a.user.role !== "superadmin") throw new AppError("FORBIDDEN");
  return a;
}

export function toCtx(u: CurrentUser): AppContext {
  return { userId: u.id, role: u.role, superadminAccount: u.isSuperadmin };
}

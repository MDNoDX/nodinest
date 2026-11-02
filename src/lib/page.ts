import "server-only";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import type { AdminPerm } from "@/lib/admin-perms";
import {
  getCurrentUser,
  requirePermPage,
  requireSuperadminPage,
  requireUser,
  toCtx,
} from "@/lib/auth/session";
import type { AppContext } from "@/db";
import { dayKey } from "./dates";
import type { Loc } from "./format";

/** Common per-page context: user, RLS context, locale, user's "today". */
export async function pageContext(opts: { admin?: boolean; perm?: AdminPerm } = {}) {
  const user = opts.perm
    ? await requirePermPage(opts.perm)
    : opts.admin
      ? await requireSuperadminPage()
      : await requireUser();
  const locale = (await getLocale()) as Loc;
  const tz = user.timezone;
  return { user, ctx: toCtx(user), db, locale, tz, today: dayKey(new Date(), tz) };
}

/**
 * Someone who has not signed in: a context that is nobody (matches no row), so
 * only what is public reaches them — public profiles, posts, covers.
 */
export const GUEST: AppContext = { userId: "00000000-0000-0000-0000-000000000000", role: "user" };

/** Pages a guest may see too (Media, public profiles and posts): the user or null. */
export async function pageContextOrGuest() {
  const user = await getCurrentUser();
  const locale = (await getLocale()) as Loc;
  if (!user) return { user: null, ctx: GUEST, db, locale, tz: "Asia/Tashkent" };
  return { user, ctx: toCtx(user), db, locale, tz: user.timezone };
}

export type SP = Promise<Record<string, string | string[] | undefined>>;
export function sp(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
export function spInt(v: string | string[] | undefined, def = 1): number {
  const n = Number(sp(v));
  return Number.isInteger(n) && n > 0 ? n : def;
}

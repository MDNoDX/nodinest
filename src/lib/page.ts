import "server-only";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { requireSuperadminPage, requireUser, toCtx } from "@/lib/auth/session";
import { dayKey } from "./dates";
import type { Loc } from "./format";

/** Common per-page context: user, RLS context, locale, user's "today". */
export async function pageContext(opts: { admin?: boolean } = {}) {
  const user = opts.admin ? await requireSuperadminPage() : await requireUser();
  const locale = (await getLocale()) as Loc;
  const tz = user.timezone;
  return { user, ctx: toCtx(user), db, locale, tz, today: dayKey(new Date(), tz) };
}

export type SP = Promise<Record<string, string | string[] | undefined>>;
export function sp(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
export function spInt(v: string | string[] | undefined, def = 1): number {
  const n = Number(sp(v));
  return Number.isInteger(n) && n > 0 ? n : def;
}

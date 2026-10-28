/**
 * Ads (admin-managed, key "ads" in app_settings): small labelled cards in
 * places that do not get in the way — the end of the home page and the
 * bottom of the side menu. Plans whose limits have `ads: false` (premium) see
 * none. Clicks go through /api/ads/<id> and are counted.
 */
import "server-only";
import { eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type AppContext } from "@/db";
import { appSettings, rateLimits } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { limitsFor } from "./premium";

export const AD_PLACES = ["home", "sidebar"] as const;
export type AdPlace = (typeof AD_PLACES)[number];

const ad = z.object({
  id: z.string().regex(/^[a-z0-9-]{4,40}$/),
  active: z.boolean().default(true),
  title: z.string().trim().min(1).max(80),
  text: z.string().trim().max(240).default(""),
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https:\/\//.test(u), "https"),
  image: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === "" || /^https:\/\//.test(u), "https")
    .default(""),
  places: z.array(z.enum(AD_PLACES)).min(1).default(["home"]),
});
export type Ad = z.infer<typeof ad>;
export const adsSchema = z.object({
  enabled: z.boolean().default(false),
  items: z.array(ad).max(20).default([]),
});
export type AdsSettings = z.infer<typeof adsSchema>;

let cache: { v: AdsSettings; at: number } | null = null;
export async function getAds(): Promise<AdsSettings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.v;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "ads"));
  const p = adsSchema.safeParse(row?.value ?? {});
  cache = { v: p.success ? p.data : adsSchema.parse({}), at: Date.now() };
  return cache.v;
}

export async function saveAds(ctx: AppContext, raw: unknown) {
  if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
  const value = adsSchema.parse(raw);
  await db
    .insert(appSettings)
    .values({ key: "ads", value, updatedBy: ctx.userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: ctx.userId } });
  cache = null;
}

/** One ad for this place (rotating by the hour), or null (premium, none, off). */
export async function adFor(ctx: AppContext, place: AdPlace): Promise<Ad | null> {
  const s = await getAds();
  if (!s.enabled) return null;
  const list = s.items.filter((a) => a.active && a.places.includes(place));
  if (!list.length) return null;
  if (!(await limitsFor(ctx)).ads) return null;
  return list[Math.floor(Date.now() / 3_600_000) % list.length];
}

export async function countClick(id: string) {
  await db.execute(sql`
    insert into nodinest.rate_limits (key, window_start, count)
    values (${`adclick:${id}`}, to_timestamp(0), 1)
    on conflict (key, window_start) do update set count = nodinest.rate_limits.count + 1`);
}

export async function clickCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ key: rateLimits.key, count: rateLimits.count })
    .from(rateLimits)
    .where(like(rateLimits.key, "adclick:%"));
  return Object.fromEntries(rows.map((r) => [r.key.slice(8), r.count]));
}

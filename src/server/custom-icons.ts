/**
 * Icons the owner adds from the internet (key "custom_icons" in app_settings):
 * found through the free Iconify index, kept here as sanitised SVG, so they
 * keep working if the source goes away. `words` make a plan item pick the icon
 * by itself from its title.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, type AppContext } from "@/db";
import { appSettings } from "@/db/schema";
import { AppError } from "@/lib/errors";

const KEY = "custom_icons";
const API = "https://api.iconify.design";
/** Colour sets only: a plan's icons are never one-colour line drawings. */
const SETS = [
  "fluent-emoji-flat",
  "fluent-emoji",
  "noto",
  "twemoji",
  "emojione",
  "openmoji",
  "fxemoji",
];
const ICON = /^[a-z0-9-]{1,40}:[a-z0-9-]{1,80}$/;
const MAX_SVG = 40_000;

export type CustomIcon = { id: string; name: string; words: string; svg: string };

export async function getCustomIcons(): Promise<CustomIcon[]> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY));
  return (row?.value as CustomIcon[] | undefined) ?? [];
}

async function save(list: CustomIcon[]) {
  await db
    .insert(appSettings)
    .values({ key: KEY, value: list })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: list } });
}

const owner = (ctx: AppContext) => {
  if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
};

/** Nothing in an icon may run or reach out. */
export function cleanSvg(svg: string) {
  const s = svg.trim();
  if (s.length > MAX_SVG || !/^<svg[\s>]/.test(s) || !s.endsWith("</svg>")) return null;
  if (
    /<(script|foreignObject|iframe|image|use|a)\b|\son\w+\s*=|javascript:|data:|https?:\/\/(?!www\.w3\.org)/i.test(
      s,
    )
  )
    return null;
  return s;
}

const getText = async (url: string) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new AppError("AI_UNAVAILABLE", "iconify");
  return r.text();
};

export async function searchIcons(ctx: AppContext, q: string) {
  owner(ctx);
  const query = z.string().trim().min(2).max(40).parse(q);
  const url = `${API}/search?query=${encodeURIComponent(query)}&limit=64&prefixes=${SETS.join(",")}`;
  const d = JSON.parse(await getText(url)) as { icons?: string[] };
  return (d.icons ?? []).filter((i) => ICON.test(i));
}

export async function iconSvg(ctx: AppContext, icon: string) {
  owner(ctx);
  if (!ICON.test(icon)) throw new AppError("VALIDATION", "icon");
  const svg = cleanSvg(await getText(`${API}/${icon.replace(":", "/")}.svg`));
  if (!svg) throw new AppError("VALIDATION", "icon");
  return svg;
}

export async function addCustomIcon(
  ctx: AppContext,
  input: { icon: string; name: string; words: string },
) {
  const svg = await iconSvg(ctx, input.icon);
  const name = z.string().trim().min(1).max(40).parse(input.name);
  const words = z.string().trim().max(300).parse(input.words);
  const list = await getCustomIcons();
  if (list.length >= 200) throw new AppError("VALIDATION", "too_many");
  const icon = { id: randomBytes(6).toString("hex"), name, words, svg };
  await save([...list, icon]);
  return icon;
}

export async function removeCustomIcon(ctx: AppContext, id: string) {
  owner(ctx);
  await save((await getCustomIcons()).filter((i) => i.id !== id));
}

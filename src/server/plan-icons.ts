/**
 * The plan icons the owner shapes (Admin → Icons), the same for everyone:
 * our pictures can be replaced, new ones added (found on Iconify, or a PNG /
 * SVG / WebP / JPG from a file or a link), words make an item pick an icon by
 * its title, and the picker's order is theirs. The index lives in app_settings
 * "plan_icons"; every picture in its own row "plan_icon:<id>" (a new id each
 * time, so a browser may keep it for a year), so a page never loads pictures
 * with the list. Pictures are stored cleaned: a sanitised SVG or a 192 px WebP.
 */
import "server-only";
import { eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { db, type AppContext } from "@/db";
import { appSettings } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { safeFetch } from "@/lib/net/safe-fetch";
import { NO_ICONS, PICKER_ICONS, type PlanIconsCfg } from "@/lib/plan-icons";

const KEY = "plan_icons";
const imgKey = (id: string) => `plan_icon:${id}`;
const ID = /^[a-f0-9]{12}$/;
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
const MAX_SVG = 300_000;
const MAX_RASTER = 3_000_000;
const SIDE = 192;
const RASTER = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
export const SVG = "image/svg+xml";

const cfgSchema = z.object({
  custom: z
    .array(z.object({ id: z.string(), name: z.string(), words: z.string(), img: z.string() }))
    .catch([]),
  over: z.record(z.string(), z.string()).catch({}),
  words: z.record(z.string(), z.string()).catch({}),
  order: z.array(z.string()).nullable().catch(null),
});

let cache: { v: PlanIconsCfg; at: number } | null = null;

export async function getPlanIcons(): Promise<PlanIconsCfg> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY));
  const parsed = cfgSchema.safeParse(row?.value ?? NO_ICONS);
  const v = parsed.success ? parsed.data : NO_ICONS;
  cache = { v, at: Date.now() };
  return v;
}

async function saveCfg(ctx: AppContext, value: PlanIconsCfg) {
  await db
    .insert(appSettings)
    .values({ key: KEY, value, updatedBy: ctx.userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: ctx.userId } });
  cache = { v: value, at: Date.now() };
}

const owner = (ctx: AppContext) => {
  if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
};

/** One stored picture, for /api/plan-icons/<id>. */
export async function iconImage(id: string) {
  if (!ID.test(id)) return null;
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, imgKey(id)));
  const v = row?.value as { type?: string; data?: string } | undefined;
  if (!v?.type || !v.data) return null;
  return {
    type: v.type,
    body: v.type === SVG ? Buffer.from(v.data, "utf8") : Buffer.from(v.data, "base64"),
  };
}

// ─── Pictures ────────────────────────────────────────────────────────────────

/** An SVG that can run nothing and reach nothing outside itself; else null. */
export function cleanSvg(svg: string) {
  const s = svg
    .replace(/^﻿/, "")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (s.length > MAX_SVG || !/^<svg[\s>]/.test(s) || !s.endsWith("</svg>")) return null;
  if (
    /<(script|foreignObject|iframe|image|use|a)\b|\son\w+\s*=|javascript:|data:|https?:\/\/(?!www\.w3\.org)/i.test(
      s,
    )
  )
    return null;
  return s;
}

/** Any raster picture (or an SVG drawn by sharp) as a square transparent 192 px WebP. */
async function toWebp(input: Buffer) {
  // Empty margins around the drawing go, so every icon fills its place alike.
  const trimmed = await sharp(input, { limitInputPixels: 40_000_000, animated: false })
    .trim()
    .toBuffer()
    .catch(() => input);
  const out = await sharp(trimmed, { limitInputPixels: 40_000_000, animated: false })
    .resize(SIDE, SIDE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
  return out.toString("base64");
}

export type Picture = { type: string; data: string };

/**
 * A picture from the owner, made safe: a clean SVG stays a (sharp) SVG; an SVG
 * with embedded pictures is drawn into a WebP when it points nowhere outside;
 * PNG / JPG / WebP / GIF / AVIF become a WebP. Anything else is refused.
 */
export async function cleanPicture(type: string, bytes: Buffer): Promise<Picture> {
  const looksSvg = type === SVG || /^\s*(<\?xml|<svg|<!--)/.test(bytes.subarray(0, 200).toString());
  try {
    if (looksSvg) {
      if (bytes.length > MAX_SVG) throw new Error("big");
      const text = bytes.toString("utf8");
      const clean = cleanSvg(text);
      if (clean) return { type: SVG, data: clean };
      // Only its own embedded data: no links, files or styles from elsewhere.
      if (/(?:href|src)\s*=\s*["'](?!data:image\/|#)|url\(\s*["']?(?!#|data:image\/)/i.test(text))
        throw new Error("outside");
      return { type: "image/webp", data: await toWebp(Buffer.from(text)) };
    }
    if (!RASTER.includes(type) || bytes.length > MAX_RASTER) throw new Error("type");
    return { type: "image/webp", data: await toWebp(bytes) };
  } catch {
    throw new AppError("VALIDATION", "image");
  }
}

const pictureInput = z.object({
  type: z.string().max(40),
  /** base64, an SVG too */
  data: z.string().max(Math.ceil(MAX_RASTER * 1.4)),
});

/** Stores a picture under a fresh id. */
async function putPicture(p: Picture) {
  const id = randomBytes(6).toString("hex");
  await db.insert(appSettings).values({ key: imgKey(id), value: p });
  return id;
}

async function dropPictures(ids: (string | undefined)[]) {
  const keys = ids.filter((x): x is string => !!x && ID.test(x)).map(imgKey);
  if (keys.length) await db.delete(appSettings).where(inArray(appSettings.key, keys));
}

// ─── Finding pictures ────────────────────────────────────────────────────────

const getText = async (url: string) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new AppError("AI_UNAVAILABLE", "iconify");
  return r.text();
};

export async function searchIcons(ctx: AppContext, q: string) {
  owner(ctx);
  const query = z.string().trim().min(2).max(40).parse(q);
  const url = `${API}/search?query=${encodeURIComponent(query)}&limit=96&prefixes=${SETS.join(",")}`;
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

/** A picture from a link the owner pasted (fetched safely), cleaned; base64 for a preview. */
export async function grabPicture(ctx: AppContext, rawUrl: string) {
  owner(ctx);
  const url = z.string().trim().url().max(2000).parse(rawUrl);
  const res = await safeFetch(url, {
    binary: true,
    maxBytes: MAX_RASTER,
    accept: "image/svg+xml,image/png,image/webp,image/*;q=0.8",
    allowTypes: [SVG, ...RASTER],
  });
  if (![SVG, ...RASTER].includes(res.contentType)) throw new AppError("VALIDATION", "image");
  const p = await cleanPicture(res.contentType, Buffer.from(res.bytes ?? []));
  return { type: p.type, data: p.type === SVG ? Buffer.from(p.data).toString("base64") : p.data };
}

// ─── The owner's changes ─────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max);

/**
 * Saves one icon: `key` is one of ours, "c:<id>" (an added one) or "new".
 * A picture replaces the old one (whose row is deleted); words and a name
 * change only what is given. Returns the whole new index.
 */
export async function saveIcon(
  ctx: AppContext,
  raw: { key: string; name?: string; words?: string; picture?: { type: string; data: string } },
) {
  owner(ctx);
  const key = z.string().max(20).parse(raw.key);
  const name = raw.name === undefined ? undefined : text(40).parse(raw.name);
  const words = raw.words === undefined ? undefined : text(300).parse(raw.words);
  const pic = raw.picture ? pictureInput.parse(raw.picture) : null;
  const picture = pic ? await cleanPicture(pic.type, Buffer.from(pic.data, "base64")) : null;
  const cfg = structuredClone(await getPlanIcons());

  if (key === "new") {
    if (!picture || !name) throw new AppError("VALIDATION", "new_icon");
    if (cfg.custom.length >= 200) throw new AppError("VALIDATION", "too_many");
    const img = await putPicture(picture);
    cfg.custom.push({ id: randomBytes(6).toString("hex"), name, words: words ?? "", img });
  } else if (key.startsWith("c:")) {
    const own = cfg.custom.find((c) => c.id === key.slice(2));
    if (!own) throw new AppError("NOT_FOUND");
    if (name) own.name = name;
    if (words !== undefined) own.words = words;
    if (picture) {
      const old = own.img;
      own.img = await putPicture(picture);
      await dropPictures([old]);
    }
  } else {
    if (!PICKER_ICONS.includes(key)) throw new AppError("NOT_FOUND");
    if (words !== undefined) {
      if (words) cfg.words[key] = words;
      else delete cfg.words[key];
    }
    if (picture) {
      const old = cfg.over[key];
      cfg.over[key] = await putPicture(picture);
      await dropPictures([old]);
    }
  }
  await saveCfg(ctx, cfg);
  return cfg;
}

/** One of ours gets its own picture back. */
export async function resetIcon(ctx: AppContext, key: string) {
  owner(ctx);
  const cfg = structuredClone(await getPlanIcons());
  const old = cfg.over[key];
  if (!old) return cfg;
  delete cfg.over[key];
  await saveCfg(ctx, cfg);
  await dropPictures([old]);
  return cfg;
}

/** An added icon goes; plans that used it show the plain pin. */
export async function removeIcon(ctx: AppContext, id: string) {
  owner(ctx);
  const cfg = structuredClone(await getPlanIcons());
  const own = cfg.custom.find((c) => c.id === id);
  if (!own) return cfg;
  cfg.custom = cfg.custom.filter((c) => c.id !== id);
  cfg.order = cfg.order?.filter((k) => k !== `c:${id}`) ?? null;
  await saveCfg(ctx, cfg);
  await dropPictures([own.img]);
  return cfg;
}

/** The picker's order (null = ours again). */
export async function saveIconOrder(ctx: AppContext, order: string[] | null) {
  owner(ctx);
  const cfg = structuredClone(await getPlanIcons());
  if (order) {
    const valid = new Set([...cfg.custom.map((c) => `c:${c.id}`), ...PICKER_ICONS]);
    cfg.order = [...new Set(z.array(z.string().max(20)).max(400).parse(order))].filter((k) =>
      valid.has(k),
    );
  } else cfg.order = null;
  await saveCfg(ctx, cfg);
  return cfg;
}

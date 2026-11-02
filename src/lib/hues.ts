import type { CSSProperties } from "react";

/** Identity colours (CSS variables from globals.css). Never used for status. */
export type Hue =
  "blue" | "indigo" | "violet" | "rose" | "orange" | "amber" | "teal" | "emerald" | "sky" | "slate";

export const TYPE_HUE: Record<string, Hue> = {
  book: "indigo",
  course: "teal",
  video: "rose",
  lecture: "violet",
  interview: "orange",
  article: "sky",
  podcast: "emerald",
  other: "slate",
};

/**
 * Five families only, so the site stays calm: reading and the library
 * (indigo), the day's plan (emerald), writing (amber), people and talk (sky),
 * the AI (rose); settings are grey.
 */
export const SECTION_HUE: Record<string, Hue> = {
  dashboard: "indigo",
  library: "indigo",
  people: "indigo",
  publishers: "indigo",
  collections: "indigo",
  review: "indigo",
  stats: "indigo",
  search: "indigo",
  guide: "indigo",
  plans: "emerald",
  journal: "emerald",
  write: "amber",
  notes: "amber",
  suggestions: "amber",
  chats: "sky",
  media: "sky",
  profile: "sky",
  community: "sky",
  assistant: "rose",
  admin: "rose",
  settings: "slate",
};

const CYCLE: Hue[] = [
  "blue",
  "violet",
  "teal",
  "amber",
  "rose",
  "sky",
  "emerald",
  "orange",
  "indigo",
];

/** Stable hue for arbitrary keys (tags, categories, collections). */
export function hueFor(key: string): Hue {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CYCLE[h % CYCLE.length];
}

export function hueStyle(hue: Hue): CSSProperties {
  return { ["--hue" as string]: `var(--c-${hue})` } as CSSProperties;
}

export const typeHue = (type: string) => hueStyle(TYPE_HUE[type] ?? "slate");

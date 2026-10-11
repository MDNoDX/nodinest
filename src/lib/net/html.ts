/** Minimal, dependency-free HTML helpers for metadata extraction. */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Visible text of an HTML document (scripts/styles removed). */
export function htmlToText(html: string, maxChars = 30_000): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
}

export type PageMeta = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  ogType: string | null;
  canonical: string | null;
  author: string | null;
  isbn: string | null;
  publishedTime: string | null;
  jsonLd: unknown[];
};

export function extractMeta(html: string, baseUrl: string): PageMeta {
  const head = html.slice(0, 300_000);
  const metas = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (
      attr(tag, "property") ??
      attr(tag, "name") ??
      attr(tag, "itemprop")
    )?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !metas.has(key)) metas.set(key, content);
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const canonicalTag = (head.match(/<link\b[^>]*rel=["']?canonical["']?[^>]*>/i) ?? [])[0];
  const abs = (u: string | null | undefined) => {
    if (!u) return null;
    try {
      const url = new URL(u, baseUrl);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
      return null;
    }
  };
  const jsonLd: unknown[] = [];
  for (const m of head.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) jsonLd.push(...parsed.slice(0, 10));
      else jsonLd.push(parsed);
    } catch {
      /* ignore malformed JSON-LD */
    }
    if (jsonLd.length >= 10) break;
  }
  const clean = (s: string | null | undefined, max = 2000) =>
    s ? decodeEntities(s).replace(/\s+/g, " ").trim().slice(0, max) || null : null;
  return {
    title: clean(metas.get("og:title") ?? metas.get("twitter:title") ?? titleTag, 400),
    description: clean(
      metas.get("og:description") ?? metas.get("description") ?? metas.get("twitter:description"),
    ),
    image: abs(metas.get("og:image") ?? metas.get("twitter:image")),
    siteName: clean(metas.get("og:site_name"), 200),
    ogType: clean(metas.get("og:type"), 60),
    canonical: abs(canonicalTag ? attr(canonicalTag, "href") : null),
    author: clean(
      metas.get("author") ?? metas.get("article:author") ?? metas.get("book:author"),
      200,
    ),
    isbn: clean(metas.get("book:isbn"), 40),
    publishedTime: clean(metas.get("article:published_time") ?? metas.get("datepublished"), 40),
    jsonLd,
  };
}

/** Parses a minimal subset of robots.txt for the given path (User-agent: *). */
export function robotsAllows(robotsTxt: string, path: string, agent = "nodinestbot"): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  const group =
    groups.find((g) => g.agents.some((a) => a !== "*" && agent.includes(a))) ??
    groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    const prefix = r.path.replace(/\*.*$/, "").replace(/\$$/, "");
    if (path.startsWith(prefix) && (!best || prefix.length > best.len)) {
      best = { allow: r.allow, len: prefix.length };
    }
  }
  return best ? best.allow : true;
}

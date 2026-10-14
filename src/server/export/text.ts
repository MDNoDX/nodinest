/** Taqriz → Markdown / plain text (portable, works in any editor or Obsidian). */
import type { DocNode } from "@/lib/writeup-doc";
import type { ExportItem } from "./data";
import { facts, fmtWhen, labels, type Loc } from "./labels";

function inlineMd(nodes?: DocNode[]): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      let t = (n.text ?? "").replace(/([*_`[\]])/g, "\\$1");
      for (const m of n.marks ?? []) {
        if (m.type === "bold") t = `**${t}**`;
        if (m.type === "italic") t = `*${t}*`;
        if (m.type === "strike") t = `~~${t}~~`;
        if (m.type === "link" && m.attrs?.href) t = `[${t}](${m.attrs.href})`;
      }
      return t;
    })
    .join("");
}
const inlineTxt = (nodes?: DocNode[]) =>
  (nodes ?? []).map((n) => (n.type === "hardBreak" ? "\n" : (n.text ?? ""))).join("");

function blocks(nodes: DocNode[], md: boolean, indent = ""): string[] {
  const inl = md ? inlineMd : inlineTxt;
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === "heading") {
      const text = inl(n.content);
      if (md) out.push(`${n.attrs?.level === 3 ? "###" : "##"} ${text}`);
      else
        out.push(
          text.toUpperCase(),
          (n.attrs?.level === 3 ? "-" : "=").repeat(Math.min(60, text.length)),
        );
    } else if (n.type === "paragraph") out.push(indent + inl(n.content));
    else if (n.type === "blockquote")
      out.push(...blocks(n.content ?? [], md).map((l) => (l ? `> ${l}` : ">")));
    else if (n.type === "horizontalRule") out.push(md ? "---" : "* * *");
    else if (n.type === "bulletList" || n.type === "orderedList") {
      (n.content ?? []).forEach((li, i) => {
        const marker =
          n.type === "orderedList" ? `${Number(n.attrs?.start ?? 1) + i}.` : md ? "-" : "•";
        const [first, ...rest] = li.content ?? [];
        out.push(`${indent}${marker} ${first ? inl(first.content) : ""}`);
        if (rest.length) out.push(...blocks(rest, md, `${indent}   `));
      });
      out.push("");
      continue;
    }
    out.push("");
  }
  return out;
}

export function renderText(
  items: ExportItem[],
  opts: { loc: Loc; timeZone: string; owner: string; combined: boolean; markdown: boolean },
): string {
  const t = labels(opts.loc);
  const md = opts.markdown;
  const parts: string[] = [];
  if (opts.combined) {
    parts.push(
      md ? `# ${t.myWriteups}` : t.myWriteups.toUpperCase(),
      "",
      `${opts.owner} · ${t.books(items.length)}`,
      "",
    );
    items.forEach((it, i) =>
      parts.push(`${i + 1}. ${it.title}${it.authors ? ` — ${it.authors}` : ""}`),
    );
    parts.push("", md ? "---" : "", "");
  }
  for (const it of items) {
    parts.push(md ? `${opts.combined ? "#" : "#"} ${it.title}` : it.title.toUpperCase());
    if (it.originalTitle) parts.push(md ? `*${it.originalTitle}*` : it.originalTitle);
    if (it.authors) parts.push(md ? `**${it.authors}**` : it.authors);
    parts.push("");
    for (const [k, v] of facts(it, opts.loc)) parts.push(md ? `- **${k}:** ${v}` : `${k}: ${v}`);
    if (it.rating)
      parts.push(
        md
          ? `- **${t.rating}:** ${"★".repeat(it.rating)}${"☆".repeat(10 - it.rating)} ${it.rating}/10`
          : `${t.rating}: ${it.rating}/10`,
      );
    const started = fmtWhen(it.startedAt, opts.loc, opts.timeZone);
    const finished = fmtWhen(it.completedAt, opts.loc, opts.timeZone);
    if (started) parts.push(md ? `- **${t.started}:** ${started}` : `${t.started}: ${started}`);
    if (finished)
      parts.push(md ? `- **${t.finished}:** ${finished}` : `${t.finished}: ${finished}`);
    if (it.opinion)
      parts.push("", md ? `> **${t.opinion}:** ${it.opinion}` : `${t.opinion}: ${it.opinion}`);
    parts.push("", md ? "---" : "", "");
    const content = it.doc?.content ?? [];
    if (content.some((n) => n.content?.length)) parts.push(...blocks(content, md));
    else parts.push(t.noText, "");
    if (it.notes.length) {
      parts.push(md ? `## ${t.notes}` : t.notes.toUpperCase(), "");
      for (const n of it.notes) {
        const meta = [
          n.pageFrom != null
            ? `${t.page} ${n.pageFrom}${n.pageTo && n.pageTo !== n.pageFrom ? `–${n.pageTo}` : ""}`
            : null,
          n.location,
        ]
          .filter(Boolean)
          .join(" · ");
        if (n.kind === "quote") parts.push(md ? `> ${n.quoteText}` : `“${n.quoteText}”`);
        if (n.title || n.body)
          parts.push(`${n.title ? (md ? `**${n.title}.** ` : `${n.title}. `) : ""}${n.body ?? ""}`);
        if (meta) parts.push(md ? `<sub>${meta}</sub>` : `(${meta})`);
        parts.push("");
      }
    }
    parts.push("");
  }
  return (
    parts
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

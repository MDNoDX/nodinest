/**
 * Taqriz documents are Tiptap/ProseMirror JSON. Everything coming from a
 * client (or the AI) is rebuilt from an allowlist here, so stored documents
 * only ever contain these nodes/marks and safe link URLs. Pure: shared by the
 * server, the editor and tests.
 */
export type DocMark = {
  /** "note": a passage saved to Notes (highlighted; `attrs.noteId` = the note). */
  type: "bold" | "italic" | "underline" | "strike" | "link" | "note";
  attrs?: { href?: string; noteId?: string };
};
export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
};
export type WriteupDoc = { type: "doc"; content: DocNode[] };

const BLOCKS = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "horizontalRule",
  // Media the user uploaded (private files, referenced by id).
  "image",
  "audio",
  "video",
  "file",
  // A YouTube video (by id) shown in place.
  "youtube",
]);
const FILE_NODES = new Set(["image", "audio", "video", "file"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const SIMPLE_MARKS = new Set(["bold", "italic", "underline", "strike"]);
const MAX_TEXT = 400_000;
const MAX_NODES = 30_000;

export const EMPTY_DOC: WriteupDoc = { type: "doc", content: [{ type: "paragraph" }] };

function safeHref(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2000) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function sanitizeDoc(raw: unknown): WriteupDoc {
  let nodes = 0;
  let chars = 0;
  const inline = (n: unknown): DocNode | null => {
    if (!n || typeof n !== "object" || ++nodes > MAX_NODES) return null;
    const o = n as DocNode;
    if (o.type === "hardBreak") return { type: "hardBreak" };
    if (o.type !== "text" || typeof o.text !== "string" || !o.text) return null;
    const text = o.text.slice(0, Math.max(0, MAX_TEXT - chars));
    chars += text.length;
    if (!text) return null;
    const marks: DocMark[] = [];
    for (const m of Array.isArray(o.marks) ? o.marks : []) {
      if (SIMPLE_MARKS.has(m?.type)) marks.push({ type: m.type });
      else if (m?.type === "link") {
        const href = safeHref(m.attrs?.href);
        if (href) marks.push({ type: "link", attrs: { href } });
      } else if (m?.type === "note") {
        const noteId = m.attrs?.noteId;
        if (typeof noteId === "string" && UUID.test(noteId))
          marks.push({ type: "note", attrs: { noteId } });
      }
    }
    return marks.length ? { type: "text", text, marks } : { type: "text", text };
  };
  const inlines = (c: unknown) =>
    (Array.isArray(c) ? c : []).map(inline).filter((x): x is DocNode => !!x);
  const block = (n: unknown): DocNode | null => {
    if (!n || typeof n !== "object" || ++nodes > MAX_NODES) return null;
    const o = n as DocNode;
    if (!BLOCKS.has(o.type)) return null;
    switch (o.type) {
      case "paragraph": {
        const content = inlines(o.content);
        return content.length ? { type: "paragraph", content } : { type: "paragraph" };
      }
      case "heading": {
        const level = o.attrs?.level === 3 ? 3 : 2;
        const content = inlines(o.content);
        return content.length
          ? { type: "heading", attrs: { level }, content }
          : { type: "heading", attrs: { level } };
      }
      case "horizontalRule":
        return { type: "horizontalRule" };
      case "youtube": {
        const videoId = o.attrs?.videoId;
        if (typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId)) return null;
        return { type: "youtube", attrs: { videoId, title: str(o.attrs?.title, 300) } };
      }
      case "image":
      case "audio":
      case "video":
      case "file": {
        const fileId = o.attrs?.fileId;
        if (typeof fileId !== "string" || !UUID.test(fileId)) return null;
        return {
          type: o.type,
          attrs: {
            fileId,
            name: str(o.attrs?.name, 200),
            ...(o.type === "file" ? { mime: str(o.attrs?.mime, 100) } : {}),
          },
        };
      }
      case "listItem": {
        const content = blocks(o.content);
        return { type: "listItem", content: content.length ? content : [{ type: "paragraph" }] };
      }
      case "bulletList":
      case "orderedList": {
        const items = blocks(o.content).filter((x) => x.type === "listItem");
        if (!items.length) return null;
        const start = Number(o.attrs?.start);
        return o.type === "orderedList" && Number.isInteger(start) && start > 1 && start < 100_000
          ? { type: o.type, attrs: { start }, content: items }
          : { type: o.type, content: items };
      }
      case "blockquote": {
        const content = blocks(o.content);
        return content.length ? { type: "blockquote", content } : null;
      }
    }
    return null;
  };
  const blocks = (c: unknown): DocNode[] =>
    (Array.isArray(c) ? c : []).map(block).filter((x): x is DocNode => !!x);
  const content = blocks((raw as DocNode | null)?.content);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function textOf(n: DocNode): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  return (n.content ?? []).map(textOf).join("");
}

/** Plain text with blank lines between blocks and "## " before chapter titles. */
export function docToPlain(doc: WriteupDoc, opts: { markHeadings?: boolean } = {}): string {
  const out: string[] = [];
  const walk = (nodes: DocNode[], prefix = "") => {
    for (const n of nodes) {
      if (n.type === "heading")
        out.push(
          (opts.markHeadings ? "#".repeat(Number(n.attrs?.level ?? 2)) + " " : "") + textOf(n),
        );
      else if (n.type === "bulletList" || n.type === "orderedList")
        (n.content ?? []).forEach((li, i) =>
          walk(li.content ?? [], n.type === "orderedList" ? `${i + 1}. ` : "• "),
        );
      else if (n.type === "blockquote") walk(n.content ?? [], "> ");
      else if (n.type === "paragraph") out.push(prefix + textOf(n));
      else if (FILE_NODES.has(n.type)) out.push(`[${n.type}: ${String(n.attrs?.name ?? "")}]`);
      else if (n.type === "youtube")
        out.push(`[video: https://youtu.be/${String(n.attrs?.videoId)}]`);
    }
  };
  walk(doc.content);
  return out.filter((l) => l.trim()).join("\n");
}

/**
 * Words the author wrote: a book template's guiding prompts (top-level
 * paragraphs that are entirely italic) do not count.
 */
export function authorWordCount(doc: WriteupDoc): number {
  const kept = {
    ...doc,
    content: (doc.content ?? []).filter(
      (n) =>
        !(
          n.type === "paragraph" &&
          n.content?.length &&
          n.content.every((c) => c.marks?.some((m) => m.type === "italic"))
        ),
    ),
  };
  return countWords(docToPlain(kept));
}

export function countWords(plain: string): number {
  const m = plain.match(/[\p{L}\p{N}'’‘ʻʼ-]+/gu);
  return m ? m.length : 0;
}

/** File ids embedded in a document (images / audio / video / files). */
export function docMedia(doc: WriteupDoc): { type: string; fileId: string; name: string }[] {
  return doc.content.flatMap((n) =>
    FILE_NODES.has(n.type) && typeof n.attrs?.fileId === "string"
      ? [{ type: n.type, fileId: n.attrs.fileId as string, name: String(n.attrs?.name ?? "") }]
      : [],
  );
}

export type OutlineItem = { index: number; level: 2 | 3; text: string };
/** Chapters: the headings of the document (index = position among top-level blocks). */
export function docOutline(doc: WriteupDoc): OutlineItem[] {
  return doc.content.flatMap((n, index) =>
    n.type === "heading" && textOf(n).trim()
      ? [{ index, level: (n.attrs?.level === 3 ? 3 : 2) as 2 | 3, text: textOf(n).trim() }]
      : [],
  );
}

/**
 * Light Markdown → document (used by the AI and imports): "## " / "### "
 * headings, "- " / "1. " lists, "> " quotes, **bold**, *italic*; blank lines
 * separate paragraphs.
 */
export function markdownToNodes(md: string): DocNode[] {
  const inlineMd = (s: string): DocNode[] => {
    const out: DocNode[] = [];
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let last = 0;
    for (const m of s.matchAll(re)) {
      if (m.index! > last) out.push({ type: "text", text: s.slice(last, m.index) });
      const bold = m[0].startsWith("**");
      out.push({
        type: "text",
        text: m[0].slice(bold ? 2 : 1, bold ? -2 : -1),
        marks: [{ type: bold ? "bold" : "italic" }],
      });
      last = m.index! + m[0].length;
    }
    if (last < s.length) out.push({ type: "text", text: s.slice(last) });
    return out.filter((n) => n.text);
  };
  const nodes: DocNode[] = [];
  let list: DocNode | null = null;
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ul || ol) {
      const type = ul ? "bulletList" : "orderedList";
      if (!list || list.type !== type) nodes.push((list = { type, content: [] }));
      list.content!.push({
        type: "listItem",
        content: [{ type: "paragraph", content: inlineMd((ul ?? ol)![1]) }],
      });
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    if (h)
      nodes.push({
        type: "heading",
        attrs: { level: h[1].length >= 3 ? 3 : 2 },
        content: inlineMd(h[2]),
      });
    else if (line.startsWith("> "))
      nodes.push({
        type: "blockquote",
        content: [{ type: "paragraph", content: inlineMd(line.slice(2)) }],
      });
    else nodes.push({ type: "paragraph", content: inlineMd(line) });
  }
  return nodes;
}

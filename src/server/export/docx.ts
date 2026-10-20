/** Taqriz → Word (.docx) with real headings, lists, quotes and a Contents field. */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  TableOfContents,
  TextRun,
  type ParagraphChild,
} from "docx";
import type { DocNode } from "@/lib/writeup-doc";
import type { ExportItem } from "./data";
import { facts, fmtWhen, labels, type Loc } from "./labels";

const BLUE = "2459E0";

function runs(nodes?: DocNode[]): ParagraphChild[] {
  return (nodes ?? []).map((n) => {
    if (n.type === "hardBreak") return new TextRun({ text: "", break: 1 });
    const has = (t: string) => n.marks?.some((m) => m.type === t);
    const run = new TextRun({
      text: n.text ?? "",
      bold: has("bold"),
      italics: has("italic"),
      underline: has("underline") ? {} : undefined,
      strike: has("strike"),
    });
    const href = n.marks?.find((m) => m.type === "link")?.attrs?.href;
    return href
      ? new ExternalHyperlink({
          link: href,
          children: [new TextRun({ text: n.text ?? "", style: "Hyperlink" })],
        })
      : run;
  });
}

let IMAGES: Record<string, Uint8Array> = {};

/** Width/height from a JPEG's SOF marker (keeps images in proportion). */
function jpegSize(b: Uint8Array): [number, number] | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    i += 2 + len;
  }
  return null;
}
function fit(b: Uint8Array, maxW = 460, maxH = 420) {
  const [w, h] = jpegSize(b) ?? [maxW, maxH];
  const k = Math.min(maxW / w, maxH / h, 1);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}
let LBL = { audio: "Audio", file: "File" };

function blocks(nodes: DocNode[], level = 0, quote = false): Paragraph[] {
  const out: Paragraph[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case "heading":
        out.push(
          new Paragraph({
            heading: n.attrs?.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2,
            children: runs(n.content),
          }),
        );
        break;
      case "paragraph":
        out.push(
          new Paragraph({
            children: runs(n.content),
            style: quote ? "Quote" : undefined,
            alignment: quote ? undefined : AlignmentType.JUSTIFIED,
          }),
        );
        break;
      case "blockquote":
        out.push(...blocks(n.content ?? [], level, true));
        break;
      case "image": {
        const data = IMAGES[String(n.attrs?.fileId)];
        if (data)
          out.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ type: "jpg", data, transformation: fit(data) })],
            }),
          );
        break;
      }
      case "audio":
      case "file":
        out.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${n.type === "audio" ? LBL.audio : LBL.file}: ${String(n.attrs?.name ?? "")}`,
                color: "5B6478",
                size: 18,
              }),
            ],
          }),
        );
        break;
      case "horizontalRule":
        out.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "DFE4EE", space: 4 } },
          }),
        );
        break;
      case "bulletList":
      case "orderedList":
        for (const li of n.content ?? []) {
          const [first, ...rest] = li.content ?? [];
          out.push(
            new Paragraph({
              children: first?.type === "paragraph" ? runs(first.content) : [],
              numbering: {
                reference: n.type === "orderedList" ? "numbers" : "bullets",
                level: Math.min(level, 2),
              },
            }),
          );
          out.push(...blocks(rest, level + 1, quote));
        }
        break;
    }
  }
  return out;
}

function bookSection(it: ExportItem, loc: Loc, tz: string, first: boolean): Paragraph[] {
  const t = labels(loc);
  const out: Paragraph[] = [];
  if (!first) out.push(new Paragraph({ children: [new PageBreak()] }));
  if (it.cover)
    out.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: "jpg",
            data: it.cover,
            transformation: fit(it.cover, 150, 225),
          }),
        ],
        spacing: { after: 200 },
      }),
    );
  out.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${it.docLabel ?? t.writeup} · ${t.types[it.type] ?? it.type}`.toUpperCase(),
          color: BLUE,
          size: 16,
          bold: true,
        }),
      ],
    }),
  );
  out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(it.title)] }));
  if (it.originalTitle)
    out.push(
      new Paragraph({
        children: [new TextRun({ text: it.originalTitle, italics: true, color: "5B6478" })],
      }),
    );
  if (it.authors)
    out.push(
      new Paragraph({
        children: [new TextRun({ text: it.authors, bold: true, size: 24 })],
        spacing: { after: 160 },
      }),
    );
  for (const [k, v] of facts(it, loc))
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${k}: `, color: "5B6478" }),
          new TextRun({ text: v, bold: true }),
        ],
      }),
    );
  if (it.rating)
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${t.rating}: `, color: "5B6478" }),
          new TextRun({ text: "★".repeat(it.rating), color: "F59E0B" }),
          new TextRun({ text: "★".repeat(10 - it.rating), color: "D7DCE5" }),
          new TextRun({ text: `  ${it.rating}/10`, bold: true }),
        ],
      }),
    );
  const started = fmtWhen(it.startedAt, it.startedPrecision, loc, tz);
  const finished = fmtWhen(it.completedAt, it.completedPrecision, loc, tz);
  const line = [
    it.status ? t.status[it.status] : null,
    started && `${t.started}: ${started}`,
    finished && `${t.finished}: ${finished}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (line)
    out.push(
      new Paragraph({
        children: [new TextRun({ text: line, size: 18, color: "5B6478" })],
        spacing: { before: 120 },
      }),
    );
  if (it.opinion)
    out.push(
      new Paragraph({
        style: "Quote",
        spacing: { before: 240 },
        children: [
          new TextRun({ text: `${t.opinion}: `, bold: true, italics: false }),
          new TextRun(it.opinion),
        ],
      }),
    );
  out.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "DFE4EE", space: 4 } },
      spacing: { after: 240 },
    }),
  );
  const content = it.doc?.content ?? [];
  IMAGES = it.images ?? {};
  LBL = { audio: t.audio, file: t.file };
  if (content.some((n) => n.content?.length || n.attrs?.fileId)) out.push(...blocks(content));
  else
    out.push(
      new Paragraph({
        children: [new TextRun({ text: t.noText, italics: true, color: "5B6478" })],
      }),
    );
  if (it.notes.length) {
    out.push(new Paragraph({ children: [new PageBreak()] }));
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t.notes)] }));
    for (const n of it.notes) {
      const meta = [
        n.pageFrom != null
          ? `${t.page} ${n.pageFrom}${n.pageTo && n.pageTo !== n.pageFrom ? `–${n.pageTo}` : ""}`
          : null,
        n.location,
      ]
        .filter(Boolean)
        .join(" · ");
      if (n.kind === "quote")
        out.push(
          new Paragraph({ style: "Quote", children: [new TextRun(`“${n.quoteText ?? ""}”`)] }),
        );
      if (n.kind === "note" || n.body)
        out.push(
          new Paragraph({
            children: [
              ...(n.title ? [new TextRun({ text: `${n.title}. `, bold: true })] : []),
              new TextRun(n.body ?? ""),
            ],
          }),
        );
      if (meta)
        out.push(
          new Paragraph({
            children: [new TextRun({ text: meta, size: 16, color: "5B6478" })],
            spacing: { after: 200 },
          }),
        );
    }
  }
  return out;
}

export async function renderDocx(
  items: ExportItem[],
  opts: { loc: Loc; timeZone: string; owner: string; combined: boolean },
): Promise<Buffer> {
  const t = labels(opts.loc);
  const children: (Paragraph | TableOfContents)[] = [];
  if (opts.combined) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "NODINEST", color: BLUE, bold: true, size: 18 })],
      }),
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(t.myWriteups)] }),
      new Paragraph({ children: [new TextRun({ text: opts.owner, bold: true, size: 28 })] }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${t.books(items.length)} · ${t.words(items.reduce((a, i) => a + i.words, 0))}`,
            color: "5B6478",
          }),
        ],
        spacing: { after: 400 },
      }),
      new TableOfContents(t.contents, { hyperlink: true, headingStyleRange: "1-1" }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }
  items.forEach((it, i) => children.push(...bookSection(it, opts.loc, opts.timeZone, i === 0)));

  const doc = new Document({
    creator: "NodiNest",
    title: opts.combined
      ? t.myWriteups
      : `${items[0]?.docLabel ?? t.writeup} — ${items[0]?.title ?? ""}`,
    features: { updateFields: opts.combined },
    styles: {
      default: {
        document: {
          run: { font: "Georgia", size: 23 },
          paragraph: { spacing: { after: 140, line: 330 } },
        },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          run: { font: "Arial", size: 64, bold: true },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Arial", size: 44, bold: true },
          paragraph: { spacing: { before: 120, after: 80 } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Arial", size: 32, bold: true, color: "0F172A" },
          paragraph: {
            spacing: { before: 360, after: 120 },
            border: { top: { style: BorderStyle.SINGLE, size: 18, color: BLUE, space: 8 } },
          },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Arial", size: 26, bold: true },
          paragraph: { spacing: { before: 240, after: 80 } },
        },
        {
          id: "Quote",
          name: "Quote",
          basedOn: "Normal",
          run: { italics: true, color: "334155" },
          paragraph: {
            indent: { left: 360 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: BLUE, space: 10 } },
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.BULLET,
            text: ["•", "◦", "▪"][level],
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 400 * (level + 1), hanging: 260 } } },
          })),
        },
        {
          reference: "numbers",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level],
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 400 * (level + 1), hanging: 300 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 } } },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

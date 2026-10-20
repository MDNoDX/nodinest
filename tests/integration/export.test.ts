import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractText } from "unpdf";
import { db } from "@/db";
import { loadExport } from "@/server/export/data";
import { renderDocx } from "@/server/export/docx";
import { renderPdf } from "@/server/export/pdf";
import { renderText } from "@/server/export/text";
import { saveNote } from "@/server/notes";
import { upsertLearningRecord } from "@/server/records";
import { submitResource } from "@/server/suggestions";
import { saveWriteup } from "@/server/writeups";
import { makeUser } from "../helpers/db";

let u: Awaited<ReturnType<typeof makeUser>>;
let other: Awaited<ReturnType<typeof makeUser>>;
let rid: string;
const tag = Date.now().toString(36);
const opts = { loc: "uz" as const, timeZone: "Asia/Tashkent", owner: "Sinov", combined: false };

beforeAll(async () => {
  u = await makeUser(db);
  other = await makeUser(db);
  rid = (
    (await submitResource(db, u, {
      type: "book",
      title: `Qiyomat va oʻlimdan soʻng ${tag}`,
      originalDate: "1096~",
      book: { publisherName: `Munir ${tag}`, pageCount: 384 },
    })) as { id: string }
  ).id;
  await upsertLearningRecord(db, u, {
    resourceId: rid,
    status: "completed",
    rating: 9,
    completedAt: "2026-05-01T15:30:00Z",
    review: "Qalbga taʼsir qiluvchi kitob.",
  });
  await saveWriteup(db, u, rid, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Kirish: gʻaflat haqida." }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Oʻlim zikri" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Muhim ", marks: [{ type: "bold" }] },
          { type: "text", text: "fikr — taʼkid." },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "qabr hayoti" }] }],
          },
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Qayta tirilish" }] },
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hikmatli soʻz." }] }],
      },
    ],
  });
  await saveNote(db, u, {
    kind: "quote",
    quoteText: "Oʻlim — eng yaxshi nasihatchi.",
    resourceId: rid,
    pageFrom: 12,
  });
});
afterAll(async () => {
  await db.$client.end();
});

describe("taqriz export", () => {
  it("collects only the user's own data", async () => {
    const [it] = await loadExport(u, { resourceIds: [rid], includeNotes: true, covers: false });
    expect(it).toMatchObject({
      title: `Qiyomat va oʻlimdan soʻng ${tag}`,
      rating: 9,
      publisher: `Munir ${tag}`,
      status: "completed",
    });
    expect(it.notes).toHaveLength(1);
    // Someone else cannot even see the entry (personal catalogs).
    expect(
      await loadExport(other, { resourceIds: [rid], includeNotes: true, covers: false }),
    ).toHaveLength(0);
    expect(await loadExport(other, { includeNotes: false, covers: false })).toHaveLength(0);
  });

  it("PDF keeps Uzbek letters, chapters, notes and dates", async () => {
    const items = await loadExport(u, { resourceIds: [rid], includeNotes: true, covers: false });
    const pdf = await renderPdf(items, opts);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    for (const s of [
      "Qiyomat va oʻlimdan soʻng",
      "Oʻlim zikri",
      "Qayta tirilish",
      "gʻaflat",
      "taʼkid",
      "Oʻlim — eng yaxshi nasihatchi",
      "taxm. 1096",
      "9/10",
    ])
      expect(text, s).toContain(s);
    // Letter-spaced capitals (headings) come out spaced: compare without spaces.
    expect(text.replace(/\s/g, "")).toContain("MUNDARIJA");
    expect(text.replace(/\s/g, "")).toContain("QISQAFIKR");
    expect(text.replace(/\s/g, "")).toContain("Qaydlarvaiqtiboslar");
  }, 60_000);

  it("Word, Markdown and text", async () => {
    const items = await loadExport(u, { resourceIds: [rid], includeNotes: true, covers: false });
    const docx = await renderDocx(items, opts);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    const md = renderText(items, { ...opts, markdown: true });
    expect(md).toContain(`# Qiyomat va oʻlimdan soʻng ${tag}`);
    expect(md).toContain("## Oʻlim zikri");
    expect(md).toContain("**Muhim **fikr");
    expect(md).toContain("- qabr hayoti");
    expect(md).toContain("> Hikmatli soʻz.");
    const txt = renderText(items, { ...opts, markdown: false });
    expect(txt).toContain("OʻLIM ZIKRI");
    expect(txt).not.toContain("**");
  });

  it("combined file of all write-ups", async () => {
    const items = await loadExport(u, { includeNotes: false, covers: false });
    const pdf = await renderPdf(items, { ...opts, combined: true });
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    expect(text).toContain("Taqrizlarim");
    expect(text).toContain("Sinov");
  }, 60_000);
});

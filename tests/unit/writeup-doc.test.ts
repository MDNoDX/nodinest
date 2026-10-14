import { describe, expect, it } from "vitest";
import {
  countWords,
  docOutline,
  docToPlain,
  markdownToNodes,
  sanitizeDoc,
} from "@/lib/writeup-doc";

describe("taqriz documents", () => {
  it("keeps only allowed nodes, marks and safe links", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, onclick: "x" },
          content: [{ type: "text", text: "Bob" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: [{ type: "bold" }, { type: "evil" }] },
            {
              type: "text",
              text: "b",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
            {
              type: "text",
              text: "c",
              marks: [{ type: "link", attrs: { href: "https://e.org/x" } }],
            },
            { type: "image", attrs: { src: "https://e.org/p.png" } },
          ],
        },
        { type: "codeBlock", content: [{ type: "text", text: "rm -rf" }] },
        { type: "iframe" },
      ],
    });
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0]).toEqual({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Bob" }],
    });
    const p = doc.content[1].content!;
    expect(p[0].marks).toEqual([{ type: "bold" }]);
    expect(p[1].marks).toBeUndefined();
    expect(p[2].marks).toEqual([{ type: "link", attrs: { href: "https://e.org/x" } }]);
    expect(p).toHaveLength(3);
  });

  it("never returns an empty document and survives garbage", () => {
    for (const raw of [null, 42, "x", {}, { content: "nope" }, { content: [null, 1, "a"] }])
      expect(sanitizeDoc(raw)).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("plain text, word count and chapters (optional)", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Kirish so‘zi." }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Til ofatlari" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "g‘iybat" }] }],
            },
          ],
        },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Yolg‘on" }] },
      ],
    });
    expect(docToPlain(doc, { markHeadings: true })).toBe(
      "Kirish so‘zi.\n## Til ofatlari\n• g‘iybat\n### Yolg‘on",
    );
    expect(countWords(docToPlain(doc))).toBe(6);
    expect(docOutline(doc).map((o) => [o.level, o.text])).toEqual([
      [2, "Til ofatlari"],
      [3, "Yolg‘on"],
    ]);
  });

  it("light Markdown for the AI", () => {
    const nodes = markdownToNodes(
      "## Bob 1\nMatn **muhim** va *kursiv*.\n\n- bir\n- ikki\n> iqtibos",
    );
    expect(nodes.map((n) => n.type)).toEqual(["heading", "paragraph", "bulletList", "blockquote"]);
    expect(nodes[1].content!.map((c) => c.marks?.[0]?.type ?? null)).toEqual([
      null,
      "bold",
      null,
      "italic",
      null,
    ]);
    expect(nodes[2].content).toHaveLength(2);
  });
});

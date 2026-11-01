import { describe, expect, it } from "vitest";
import { repeatedLines, speechBlocks, withoutRepeats } from "@/lib/book-blocks";

describe("speechBlocks", () => {
  it("sets speech and narration apart, word for word", () => {
    const text = "“Beyond a doubt,” his father said. “Come, let us see.” He rode on.";
    const blocks = speechBlocks(text);
    expect(blocks.map((b) => b.k)).toEqual(["d", "p", "d", "p"]);
    expect(blocks.map((b) => b.t).join(" ")).toBe(text);
  });

  it("leaves a quoted word inside narration alone", () => {
    expect(speechBlocks("He called it “the Wall” and left.")).toEqual([
      { k: "p", t: "He called it “the Wall” and left." },
    ]);
  });

  it("keeps a dash line whole and a speech cut by the page end", () => {
    expect(speechBlocks("— Qayerga? — dedi chol.")).toEqual([
      { k: "d", t: "— Qayerga? — dedi chol." },
    ]);
    expect(speechBlocks("“One day, Bran, you will")).toEqual([
      { k: "d", t: "“One day, Bran, you will" },
    ]);
  });
});

describe("repeatedLines", () => {
  const page = (n: number) => ({
    page: n,
    content: `Ernest Heminguey. Chol va dengiz\nwww.ziyouz.com\nMatn ${"abc".repeat(n)} davom etadi\n${n}`,
  });
  const pages = Array.from({ length: 10 }, (_, i) => page(i + 1));

  it("keeps a running header on its first page only", () => {
    const repeats = repeatedLines(pages);
    expect(withoutRepeats(pages[0].content, 1, repeats)).toContain("Chol va dengiz");
    const later = withoutRepeats(pages[4].content, 5, repeats);
    expect(later).not.toContain("Chol va dengiz");
    expect(later).not.toContain("ziyouz");
    expect(later).toContain("davom etadi");
  });

  it("does nothing to a short book", () => {
    expect(repeatedLines(pages.slice(0, 3)).size).toBe(0);
  });
});

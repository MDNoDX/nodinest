import { describe, expect, it } from "vitest";
import {
  runningPhrases,
  speechBlocks,
  stripBlocks,
  stripRunning,
  stripSites,
} from "@/lib/book-blocks";

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

  it("takes the narrator's words out of dash dialogue", () => {
    expect(speechBlocks("— Яна пича есанг-чи,— деди у.— Еявер, уялма.")).toEqual([
      { k: "d", t: "— Яна пича есанг-чи," },
      { k: "p", t: "деди у." },
      { k: "d", t: "— Еявер, уялма." },
    ]);
    expect(
      speechBlocks("«У кўп ўтмай ўлади,— ўйларди чол.— Доимо сузиб юриш мумкин эмас»"),
    ).toEqual([
      { k: "d", t: "«У кўп ўтмай ўлади," },
      { k: "p", t: "ўйларди чол." },
      { k: "d", t: "Доимо сузиб юриш мумкин эмас»" },
    ]);
  });

  it("keeps a plain dash line and a speech cut by the page end", () => {
    expect(speechBlocks("— Ha — yo‘q, dedi.")).toEqual([{ k: "d", t: "— Ha — yo‘q, dedi." }]);
    expect(speechBlocks("“One day, Bran, you will")).toEqual([
      { k: "d", t: "“One day, Bran, you will" },
    ]);
  });
});

describe("running phrases", () => {
  // A different text on each page, as in a real book.
  const body = (n: number) =>
    `бошқа${n} қармоқнинг${n} эҳтиёт калавасига${n} улади${n} шу${n} билан${n} ҳаммаси тахт${n} бўлди${n}`;
  // As such PDFs come out: the header, the number and the text on one line.
  const page = (n: number) => ({
    page: n,
    content: `Эрнест Хемингуэй. Чол ва денгиз (қисса) www.ziyouz.com кутубхонаси ${n} ${body(n)}`,
  });
  const pages = Array.from({ length: 20 }, (_, i) => page(i + 1));
  const phrases = runningPhrases(pages);

  it("finds what is run together with the page number and the text", () => {
    const out = stripRunning(pages[9].content, 10, phrases);
    expect(out).not.toMatch(/ziyouz|кутубхонаси|Хемингуэй|Чол ва денгиз/);
    expect(out.trim().startsWith("бошқа10 қармоқнинг10")).toBe(true);
    expect(out).toContain("эҳтиёт калавасига10");
  });

  it("keeps the book's title on its first pages, never the site", () => {
    const out = stripRunning(pages[0].content, 1, phrases);
    expect(out).toContain("Чол ва денгиз");
    expect(out).not.toContain("ziyouz");
  });

  it("removes a site from any book, however rarely it appears", () => {
    expect(stripRunning("www.ziyouz.com kutubxonasi 7\nMatn davom etadi.", 7, [])).toBe(
      "Matn davom etadi.",
    );
  });

  it("leaves the same words alone in the middle of the story", () => {
    const text = `${"сўз ".repeat(40)}чол ва денгиз ўртасида жимлик ${"сўз ".repeat(40)}`;
    expect(stripRunning(text, 9, [["чол", "ва", "денгиз"]])).toContain("чол ва денгиз");
  });

  it("never cuts the same words out of a sentence near the page's end", () => {
    const text = `${"сўз ".repeat(30)}— Яна пича еганг-чи,— деди у.— Уялма.`;
    expect(stripRunning(text, 9, [["пича", "еганг-чи", "деди"]])).toBe(text);
  });

  it("takes marks one after another from the edge", () => {
    const out = stripRunning("Эрнест Хемингуэй 14 Чол ва денгиз Матн бошланди.", 9, [
      ["эрнест", "хемингуэй"],
      ["чол", "ва", "денгиз"],
    ]);
    expect(out).toBe("Матн бошланди.");
  });

  it("never takes a dialogue dash or quote with it", () => {
    const out = stripRunning("www.ziyouz.com кутубхонаси 14 — Яна пича есанг-чи,— деди у.", 14, []);
    expect(out.startsWith("— Яна")).toBe(true);
  });

  it("does not mistake a short book's words for a header", () => {
    expect(runningPhrases(pages.slice(0, 3))).toEqual([]);
  });

  it("cleans a page already laid out and drops what is left empty", () => {
    expect(
      stripBlocks(
        [
          { k: "p", t: "www.ziyouz.com кутубхонаси 14 бошқа қармоқнинг" },
          { k: "c", t: "Чол ва денгиз" },
          { k: "p", t: "." },
        ],
        14,
        [["чол", "ва", "денгиз"]],
      ),
    ).toEqual([{ k: "p", t: "бошқа қармоқнинг" }]);
  });

  it("reads no site aloud, and a title only where the story says it", () => {
    const said = stripSites(
      "эди. Чол ва денгиз www.ziyouz.com кутубхонаси 15 шамол турди. Чол ва денгиз ўртасида жимлик",
      [["чол", "ва", "денгиз"]],
    );
    expect(said).toBe("эди\nшамол турди. Чол ва денгиз ўртасида жимлик");
  });
});

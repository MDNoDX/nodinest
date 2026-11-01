import { describe, expect, it } from "vitest";
import {
  cleanLines,
  contentsLines,
  faithfulness,
  joinPages,
  planText,
  runs,
  withPictureTitles,
} from "@/lib/audiobook-plan";

const sentence = (n: number) => `Bu ${n}-gap, unda bir necha so‘z bor va u nuqta bilan tugaydi. `;

describe("planText", () => {
  const pages = [
    { page: 1, content: "KITOB NOMI\nNashriyot, 2026" },
    { page: 2, content: Array.from({ length: 120 }, (_, i) => sentence(i)).join("") },
    {
      page: 3,
      content: "IKKINCHI BOB\n\n" + Array.from({ length: 10 }, (_, i) => sentence(i)).join(""),
    },
  ];
  const { text, starts } = joinPages(pages);
  const segs = planText(text, starts, [starts[1].at, starts[2].at]);

  it("covers the whole text without gaps or overlaps", () => {
    expect(segs[0][0]).toBe(0);
    expect(segs.at(-1)![1]).toBe(text.length);
    for (let i = 1; i < segs.length; i++) expect(segs[i][0]).toBe(segs[i - 1][1]);
  });
  it("starts a new piece where the text and each chapter begin", () => {
    expect(segs.some((s) => s[0] === starts[1].at && s[2] === 2)).toBe(true);
    expect(segs.some((s) => s[0] === starts[2].at && s[2] === 3)).toBe(true);
    expect(segs[0][1]).toBeLessThanOrEqual(starts[1].at);
  });
  it("cuts long text at sentence ends into ~3-minute pieces", () => {
    const body = segs.filter((s) => s[2] === 2);
    expect(body.length).toBeGreaterThan(1);
    for (const s of body.slice(0, -1)) {
      expect(s[1] - s[0]).toBeLessThanOrEqual(3200);
      expect(s[1] - s[0]).toBeGreaterThanOrEqual(1800);
      expect(text.slice(s[0], s[1]).trimEnd().endsWith(".")).toBe(true);
    }
  });
});

describe("cleanLines", () => {
  const cast = { characters: [{ name: "Dilnoza", aliases: ["qizim"] }] };
  it("drops bare dashes, maps aliases, merges a speaker's lines and keeps punctuation", () => {
    const out = cleanLines(
      [
        { speaker: "narrator", text: "Birinchi bob", heading: true },
        { speaker: "narrator", text: "U kirdi. —" },
        { speaker: "narrator", text: "—" },
        { speaker: "QIZIM", text: "— Salom, dada!" },
        { speaker: "Begona", text: "Kim bor?" },
        { speaker: "woman", text: "Men!" },
      ],
      cast,
    );
    expect(out).toEqual([
      { speaker: "narrator", text: "Birinchi bob." },
      { speaker: "narrator", text: "U kirdi." },
      { speaker: "Dilnoza", text: "Salom, dada!" },
      { speaker: "narrator", text: "Kim bor?" },
      { speaker: "woman", text: "Men!" },
    ]);
  });
});

describe("runs", () => {
  it("never puts more than two voices in one request", () => {
    const lines = ["narrator", "A", "narrator", "B", "narrator", "A"].map((speaker, i) => ({
      speaker,
      text: `Gap ${i}.`,
    }));
    for (const g of runs(lines))
      expect(new Set(g.map((l) => l.speaker)).size).toBeLessThanOrEqual(2);
  });
  it("keeps everyone's own voice in a talk of three", () => {
    const turn = ["narrator", "A", "narrator", "B", "narrator", "C", "narrator", "A", "narrator"];
    const lines = turn.map((speaker, i) => ({ speaker, text: `Gap raqami ${i}.` }));
    const out = runs(lines);
    expect(out.flat()).toEqual(lines);
  });
  it("in a long talk the short words between speakers join the speech", () => {
    const talk = Array.from({ length: 14 }, (_, i) => [
      { speaker: i % 2 ? "B" : "A", text: `Gap raqami ${i}, bir oz so‘z bilan.` },
      { speaker: "narrator", text: "dedi u." },
    ]).flat();
    const lines = [...talk, { speaker: "A", text: "Oxirgi gap." }];
    const out = runs(lines);
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out.flat().map((l) => l.text)).toEqual(lines.map((l) => l.text));
    // Nobody who speaks loses their voice.
    const said = out.flat().filter((l) => l.text.startsWith("Gap"));
    expect(said.map((l) => l.speaker)).toEqual(
      lines.filter((l) => l.text.startsWith("Gap")).map((l) => l.speaker),
    );
    // A long piece of narration stays the narrator's.
    const long =
      "U uzoq vaqt jim turdi, keyin derazaga qaradi va yomg‘ir to‘xtaganini ko‘rib, sekin yo‘lga tushdi.";
    const scene = [...lines.slice(0, 5), { speaker: "narrator", text: long }, ...lines.slice(5)];
    expect(
      runs(scene)
        .flat()
        .find((l) => l.text === long)?.speaker,
    ).toBe("narrator");
  });
  it("lets the narrator read the quietest only when a crowd needs too many requests", () => {
    const turn = Array.from({ length: 40 }, (_, i) => "ABCDEF"[i % 6]);
    const lines = turn.map((speaker, i) => ({
      speaker,
      text: speaker === "F" ? "Ha." : `Uzunroq gap raqami ${i}, bir oz ko‘proq so‘z bilan.`,
    }));
    const out = runs(lines);
    expect(out.length).toBeLessThanOrEqual(6);
    // Every word is still spoken, in order.
    expect(out.flat().map((l) => l.text)).toEqual(lines.map((l) => l.text));
    expect(out.flat().some((l) => l.speaker === "F")).toBe(false);
  });
});

describe("faithfulness", () => {
  it("notices a dropped speaker name", () => {
    const src = "“We should start back,” Gared urged as the woods began to grow dark.";
    const bad = faithfulness(src, "We should start back, urged as the woods began to grow dark.");
    expect(bad.missing).toEqual(["gared"]);
    expect(bad.coverage).toBeLessThan(0.97);
    expect(
      faithfulness(src, "We should start back, Gared urged as the woods began to grow dark.")
        .coverage,
    ).toBe(1);
  });
  it("ignores spelled-out numbers", () => {
    expect(
      faithfulness("XIX asrda 12 km yurdi.", "O‘n to‘qqizinchi asrda o‘n ikki kilometr yurdi.")
        .missing,
    ).toEqual(["xix", "km"]);
  });
});

describe("contents and pictures", () => {
  it("reads the PDF's own contents page and the list pages after it", () => {
    const toc = contentsLines([
      { page: 2, content: "A GAME OF THRONES\nContents\nMaps\nThe North\nl Prologue\nl Chapter 1" },
      { page: 3, content: "l Chapter 2\nl Chapter 3" },
      {
        page: 6,
        content: "PROLOGUE\n" + "A long line of the story that goes on and on. ".repeat(4),
      },
    ]);
    expect(toc?.page).toBe(2);
    expect(toc?.lines.map((l) => l.line)).toContain("l Chapter 3");
    expect(toc?.lines.some((l) => l.page === 6)).toBe(false);
  });
  it("puts picture pages' titles in their place", () => {
    const out = withPictureTitles(
      [
        { page: 2, content: "Title" },
        { page: 6, content: "PROLOGUE" },
      ],
      [{ page: 4, text: "Maps\nThe North" }],
    );
    expect(out.map((p) => [p.page, p.content])).toEqual([
      [2, "Title"],
      [4, "Maps\nThe North"],
      [6, "PROLOGUE"],
    ]);
  });
});

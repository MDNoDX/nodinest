import { describe, expect, it } from "vitest";
import { cleanLines, faithfulness, joinPages, planText, runs } from "@/lib/audiobook-plan";

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
      ],
      cast,
    );
    expect(out).toEqual([
      { speaker: "narrator", text: "Birinchi bob." },
      { speaker: "narrator", text: "U kirdi." },
      { speaker: "Dilnoza", text: "Salom, dada!" },
      { speaker: "narrator", text: "Kim bor?" },
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
  it("lets the narrator read the quietest characters when a scene needs too many requests", () => {
    const turn = ["A", "B", "C", "A", "B", "C", "A", "B"];
    const lines = turn.map((speaker, i) => ({
      speaker,
      text: speaker === "C" ? "Ha." : `Uzunroq gap raqami ${i}, bir oz ko‘proq so‘z bilan.`,
    }));
    const out = runs(lines);
    expect(out.length).toBeLessThanOrEqual(3);
    // Every word is still spoken, in order.
    expect(out.flat().map((l) => l.text)).toEqual(lines.map((l) => l.text));
    expect(out.flat().some((l) => l.speaker === "C")).toBe(false);
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

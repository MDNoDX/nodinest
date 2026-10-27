import { describe, expect, it } from "vitest";
import { reflow } from "@/lib/reflow";

describe("reflow", () => {
  it("joins PDF lines into paragraphs, mends hyphenation, keeps headings", () => {
    const page = [
      "BRAN",
      "The morning had dawned clear and cold, with a crisp-",
      "ness that hinted at the end of summer. They set forth at",
      "daybreak to see a man beheaded.",
      "Bran rode with his father and his brothers, with the",
      "others in the long line behind them.",
      "17",
    ].join("\n");
    expect(reflow(page)).toEqual([
      { text: "BRAN", heading: true },
      {
        text: "The morning had dawned clear and cold, with a crispness that hinted at the end of summer. They set forth at daybreak to see a man beheaded.",
        heading: false,
      },
      {
        text: "Bran rode with his father and his brothers, with the others in the long line behind them.",
        heading: false,
      },
    ]);
  });
  it("starts a new paragraph at a dialogue dash", () => {
    const out = reflow(
      "U kirib keldi va atrofga uzoq qarab turdi, so'ng gapirdi\n— Salom, — dedi u.",
    );
    expect(out.map((p) => p.text)).toEqual([
      "U kirib keldi va atrofga uzoq qarab turdi, so'ng gapirdi",
      "— Salom, — dedi u.",
    ]);
  });
});

describe("reflow noise and titles", () => {
  it("drops running lines and keeps a title after a short line", () => {
    const noise = new Set(["previoustableofcontentsnext"]);
    const out = reflow(
      "previous | Table of Contents | next\nPROLOGUE\nWe should start back, Gared urged.",
      noise,
    );
    expect(out).toEqual([
      { text: "PROLOGUE", heading: true },
      { text: "We should start back, Gared urged.", heading: false },
    ]);
  });
});

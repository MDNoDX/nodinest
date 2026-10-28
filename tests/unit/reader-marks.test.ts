import { describe, expect, it } from "vitest";
import { marked } from "@/lib/reader-marks";

const q = { id: "1", kind: "quote" as const, text: "the woods began to grow dark", page: 6 };

describe("reader marks", () => {
  it("highlights a saved quote and the searched word, without overlaps", () => {
    const out = marked("Gared urged as the woods began to grow dark around Gared.", [q], "gared");
    expect(out).toEqual([
      { t: "Gared", hit: true },
      " urged as ",
      { t: "the woods began to grow dark", m: q },
      " around ",
      { t: "Gared", hit: true },
      ".",
    ]);
  });
  it("folds Uzbek apostrophes while searching", () => {
    expect(marked("O‘zbekiston go‘zal", [], "o'zbek")).toEqual([
      { t: "O‘zbek", hit: true },
      "iston go‘zal",
    ]);
  });
  it("finds a quote that started in an earlier paragraph", () => {
    const long = {
      ...q,
      text: "first paragraph words here. And it goes on into the next paragraph quite far",
    };
    expect(marked("And it goes on into the next paragraph quite far", [long])[0]).toMatchObject({
      m: long,
    });
  });
});

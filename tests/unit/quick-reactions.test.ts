import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK, parseQuick } from "@/lib/quick-reactions";

describe("parseQuick", () => {
  it("gives the default when nothing is chosen", () => {
    expect(parseQuick("")).toEqual(DEFAULT_QUICK);
    expect(parseQuick("not json")).toEqual(DEFAULT_QUICK);
  });

  it("keeps the chosen order", () => {
    const mine = ["😎", "👍", "❤️", "😂", "😮", "😢", "🙏"];
    expect(parseQuick(JSON.stringify(mine))).toEqual(mine);
  });

  it("drops repeats and fills a short list from the default", () => {
    const got = parseQuick(JSON.stringify(["😎", "😎", 5, "👍"]));
    expect(got).toHaveLength(DEFAULT_QUICK.length);
    expect(got.slice(0, 2)).toEqual(["😎", "👍"]);
    expect(new Set(got).size).toBe(got.length);
  });
});

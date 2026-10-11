import { describe, expect, it } from "vitest";
import {
  duplicateKey,
  escapeLike,
  makeSnippet,
  normalizeTag,
  normalizeText,
  parseIsbn,
  searchTokens,
  toPrefixTsQuery,
} from "@/lib/normalize";

describe("normalizeText", () => {
  it("strips every Uzbek apostrophe variant and lowercases", () => {
    for (const v of [
      "O‘zbekiston",
      "O'zbekiston",
      "Oʻzbekiston",
      "O`zbekiston",
      "OʼZBEKISTON",
      "O’zbekiston",
    ]) {
      expect(normalizeText(v)).toBe("ozbekiston");
    }
    expect(normalizeText("  G‘afur   G‘ulom ")).toBe("gafur gulom");
  });
});

describe("search tokens", () => {
  it("drops tsquery syntax and dedupes", () => {
    expect(searchTokens("sapiens & | ! :* ( ) sapiens")).toEqual(["sapiens"]);
    expect(toPrefixTsQuery(searchTokens("Brief history"))).toBe("brief:* & history:*");
    expect(toPrefixTsQuery([])).toBeNull();
  });
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("duplicate keys and tags", () => {
  it("ignores punctuation and case", () => {
    expect(duplicateKey("Sapiens: A Brief History!")).toBe(duplicateKey("sapiens a brief history"));
    expect(normalizeTag("Tarix va  Falsafa")).toBe("tarix-va-falsafa");
  });
});

describe("parseIsbn", () => {
  it("validates checksums", () => {
    expect(parseIsbn("978-0-306-40615-7")).toEqual({ scheme: "isbn13", value: "9780306406157" });
    expect(parseIsbn("0-306-40615-2")).toEqual({ scheme: "isbn10", value: "0306406152" });
    expect(parseIsbn("080442957X")).toEqual({ scheme: "isbn10", value: "080442957X" });
    expect(parseIsbn("9780306406158")).toBeNull();
    expect(parseIsbn("abc")).toBeNull();
  });
});

describe("makeSnippet", () => {
  it("highlights apostrophe-insensitive word-prefix matches", () => {
    const parts = makeSnippet("Bugun O‘zbek adabiyoti haqida gaplashamiz.", ["ozbek"]);
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(["O‘zbek"]);
    expect(parts.map((p) => p.text).join("")).toContain("adabiyoti");
  });
  it("does not match inside words", () => {
    expect(makeSnippet("unhistorical", ["history"]).some((p) => p.match)).toBe(false);
  });
  it("adds ellipses around long text", () => {
    const text = `${"a ".repeat(200)}target ${"b ".repeat(200)}`;
    const parts = makeSnippet(text, ["target"], 20);
    expect(parts[0].text).toBe("…");
    expect(parts.at(-1)!.text).toBe("…");
  });
});

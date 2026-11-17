import { describe, expect, it } from "vitest";
import { coverSrcSet, sharperCover } from "@/lib/cover-url";

describe("cover pictures", () => {
  it("offers our own files in three widths", () => {
    const s = coverSrcSet("/api/files/0b4c4f2e-1111-4222-8333-944445555666?w=480");
    expect(s).toContain("?w=720&v=2 720w");
    expect(s?.split(",")).toHaveLength(3);
    expect(coverSrcSet("https://example.com/a.jpg")).toBeUndefined();
  });
  it("asks known hosts for their large picture", () => {
    expect(sharperCover("https://covers.openlibrary.org/b/id/123-M.jpg")).toBe(
      "https://covers.openlibrary.org/b/id/123-L.jpg",
    );
    expect(sharperCover("https://i.ytimg.com/vi/abc_DEF-1/mqdefault.jpg")).toBe(
      "https://i.ytimg.com/vi/abc_DEF-1/hqdefault.jpg",
    );
    expect(sharperCover("https://m.media-amazon.com/images/I/81abc+XYZ._SY466_.jpg")).toBe(
      "https://m.media-amazon.com/images/I/81abc+XYZ.jpg",
    );
    expect(sharperCover("https://hilolnashr.uz/cover.jpg")).toBe("https://hilolnashr.uz/cover.jpg");
  });
});

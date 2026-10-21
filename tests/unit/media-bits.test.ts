import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/durations";
import { docMedia, docToPlain, sanitizeDoc } from "@/lib/writeup-doc";
import { youtubeIdFromUrl } from "@/lib/youtube";

describe("formatDuration", () => {
  it("keeps seconds for short videos", () => {
    expect(formatDuration(112, "uz")).toBe("1 daq 52 son");
    expect(formatDuration(45, "en")).toBe("45 s");
    expect(formatDuration(600, "uz")).toBe("10 daq");
    expect(formatDuration(3725, "uz")).toBe("1 soat 2 daq");
  });
});

describe("youtubeIdFromUrl", () => {
  it("reads ids from links and bare ids", () => {
    expect(youtubeIdFromUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("video nodes", () => {
  const id = "0b6f0f5e-4c1a-4f3e-9d6b-2f1e5a7c9d10";
  it("keeps videos and YouTube embeds, drops bad ones", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        { type: "video", attrs: { fileId: id, name: "intervyu.mp4", extra: 1 } },
        { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ", title: "Ma’ruza" } },
        { type: "youtube", attrs: { videoId: "<script>" } },
      ],
    });
    expect(doc.content).toEqual([
      { type: "video", attrs: { fileId: id, name: "intervyu.mp4" } },
      { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ", title: "Ma’ruza" } },
    ]);
    expect(docMedia(doc)).toEqual([{ type: "video", fileId: id, name: "intervyu.mp4" }]);
    expect(docToPlain(doc)).toContain("https://youtu.be/dQw4w9WgXcQ");
  });
});

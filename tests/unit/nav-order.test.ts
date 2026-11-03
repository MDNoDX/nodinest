import { describe, expect, it } from "vitest";
import { fillOrder, sortByOrder } from "@/lib/nav-order";

describe("menu order", () => {
  it("a drag in the phone menu keeps the bar's sections in their places", () => {
    // "/library" and "/media" sit on the bar, so the phone menu shows only the rest.
    const full = ["/", "/plans", "/library", "/review", "/media", "/write"];
    expect(fillOrder(full, ["/write", "/plans", "/review"])).toEqual([
      "/",
      "/write",
      "/library",
      "/plans",
      "/media",
      "/review",
    ]);
  });

  it("the saved order is what Settings shows", () => {
    const items = ["/", "/plans", "/library"].map((href) => ({ href }));
    expect(sortByOrder(items, ["/library", "/"]).map((i) => i.href)).toEqual([
      "/library",
      "/",
      "/plans",
    ]);
  });
});

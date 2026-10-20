import { getSchema } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { findAll } from "@/components/taqriz/find";

const schema = getSchema([StarterKit]);
const doc = (paras: string[]) =>
  Node.fromJSON(schema, {
    type: "doc",
    content: paras.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })),
  });

describe("find in taqriz", () => {
  it("ignores case and Uzbek apostrophe variants and maps to document positions", () => {
    const d = doc(["O‘zbek tili", "o'zbek adabiyoti va OʻZBEK xalqi"]);
    const hits = findAll(d, "o'zbek");
    expect(hits).toHaveLength(3);
    for (const h of hits) expect(d.textBetween(h.from, h.to).toLowerCase()).toMatch(/^o.zbek$/);
  });
  it("finds nothing for an empty query", () => {
    expect(findAll(doc(["abc"]), "")).toHaveLength(0);
  });
});

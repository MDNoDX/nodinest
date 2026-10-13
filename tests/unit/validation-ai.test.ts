import { describe, expect, it, vi } from "vitest";
import {
  learningRecordInput,
  noteInput,
  personInput,
  planInput,
  resourceInput,
} from "@/lib/validation";

vi.mock("@/db", () => ({ db: {}, withUser: vi.fn() }));
const { TOOLS, parseToolArgs } = await import("@/server/ai/tools");
const { AI_TOOL_NAMES } = await import("@/server/settings");

describe("input validation", () => {
  it("person: empty optional fields become null, unknown dates stay null", () => {
    const p = personInput.parse({ fullName: "  Abdulla Qodiriy ", birthDate: "", portraitUrl: "" });
    expect(p).toMatchObject({
      fullName: "Abdulla Qodiriy",
      birthDate: null,
      portraitUrl: null,
      aliases: [],
    });
    expect(
      personInput.safeParse({ fullName: "x", websiteUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(personInput.safeParse({ fullName: "" }).success).toBe(false);
  });
  it("resource: requires contributor person xor name", () => {
    expect(
      resourceInput.safeParse({ type: "book", title: "A", contributors: [{ role: "author" }] })
        .success,
    ).toBe(false);
    expect(
      resourceInput.safeParse({
        type: "book",
        title: "A",
        contributors: [
          { personId: "00000000-0000-4000-8000-000000000000", newPersonName: "B", role: "author" },
        ],
      }).success,
    ).toBe(false);
    expect(resourceInput.safeParse({ type: "magazine", title: "A" }).success).toBe(false);
  });
  it("quotes need exact text; commentary stays separate", () => {
    expect(noteInput.safeParse({ kind: "quote", body: "my thoughts" }).success).toBe(false);
    const q = noteInput.parse({ kind: "quote", quoteText: "Ilm — nur.", body: "Commentary" });
    expect(q.quoteText).toBe("Ilm — nur.");
    expect(q.visibility).toBe("private");
  });
  it("records validate progress and dates", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(
      learningRecordInput.safeParse({
        resourceId: id,
        status: "completed",
        startedAt: "2026-02-01T10:00:00Z",
        completedAt: "2026-01-01T10:00:00Z",
      }).success,
    ).toBe(false);
    // 10-point scale for every type; "abandoned" was merged into "paused".
    expect(
      learningRecordInput.safeParse({ resourceId: id, status: "in_progress", rating: 10 }).success,
    ).toBe(true);
    expect(
      learningRecordInput.safeParse({ resourceId: id, status: "in_progress", rating: 11 }).success,
    ).toBe(false);
    expect(learningRecordInput.safeParse({ resourceId: id, status: "abandoned" }).success).toBe(
      false,
    );
    const r = learningRecordInput.parse({
      resourceId: id,
      status: "completed",
      startedAt: "2026-01-01T09:15:00Z",
      completedAt: "2026-01-20T21:40:00Z",
    });
    expect(r.completedAt).toBeTruthy();
  });
  it("empty optional numbers stay null (never coerced to 0)", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const r = learningRecordInput.parse({
      resourceId: id,
      status: "in_progress",
      progressCurrent: "",
      progressTotal: null,
    });
    expect(r.progressCurrent).toBeNull();
    expect(r.progressTotal).toBeNull();
    expect(
      learningRecordInput.parse({ resourceId: id, status: "planned", progressCurrent: "0" })
        .progressCurrent,
    ).toBe(0);
  });
  it("plans: start on / finish on, never backwards", () => {
    expect(
      planInput.safeParse({ title: "Xamsa", startOn: "2026-05-01", endOn: "2026-05-20" }).success,
    ).toBe(true);
    const bad = planInput.safeParse({ title: "Xamsa", startOn: "2026-05-20", endOn: "2026-05-01" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toBe("end_before_start");
  });
});

describe("AI tool contracts", () => {
  const names = Object.keys(TOOLS) as (keyof typeof TOOLS)[];
  it("every tool has a permission group, a mode and a matching JSON schema", () => {
    for (const name of names) {
      const def = TOOLS[name] as unknown as {
        perm: string;
        mode: string;
        parameters: { properties: Record<string, unknown>; required?: string[] };
        args: { shape?: Record<string, unknown> };
      };
      expect(AI_TOOL_NAMES, name).toContain(def.perm);
      expect(["read", "act", "confirm"], name).toContain(def.mode);
      const declared = Object.keys(def.parameters.properties).sort();
      if (def.args.shape) expect(declared, name).toEqual(Object.keys(def.args.shape).sort());
      for (const r of def.parameters.required ?? []) expect(declared, name).toContain(r);
    }
  });
  it("destructive tools always need the user's confirmation", () => {
    const confirm = names.filter((n) => TOOLS[n].mode === "confirm").sort();
    expect(confirm).toEqual([
      "archive_resource",
      "delete_collection",
      "delete_note",
      "remove_from_library",
    ]);
    for (const n of confirm) expect(["delete", "write_catalog"]).toContain(TOOLS[n].perm);
    // Read tools never write.
    for (const n of names.filter((x) => TOOLS[x].mode === "read"))
      expect(["read_library", "read_web"], n).toContain(TOOLS[n].perm);
  });
  it("rejects malformed or dangerous arguments", () => {
    expect(() => parseToolArgs("read_url", { url: "file:///etc/passwd" })).toThrow();
    expect(() => parseToolArgs("update_my_record", { resourceId: "1; drop table" })).toThrow();
    expect(() => parseToolArgs("update_my_record", { title: "X", rating: 11 })).toThrow();
    expect(() =>
      parseToolArgs("set_rank", { title: "X", collectionName: "Top", rank: 0 }),
    ).toThrow();
    expect(() => parseToolArgs("read_book_pages", { title: "X", fromPage: -1 })).toThrow();
    expect(parseToolArgs("update_my_record", { title: "Xamsa", rating: 9 })).toMatchObject({
      rating: 9,
    });
  });
});

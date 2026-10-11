import { describe, expect, it, vi } from "vitest";
import { learningRecordInput, noteInput, personInput, resourceInput } from "@/lib/validation";

vi.mock("@/db", () => ({ db: {}, withUser: vi.fn() }));
const { toolArgSchemas, WRITE_TOOLS, TOOL_PERMISSION, toolDeclarations } =
  await import("@/server/ai/tools");
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
        startedOn: "2026-02-01",
        completedOn: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(
      learningRecordInput.safeParse({ resourceId: id, status: "in_progress", rating: 6 }).success,
    ).toBe(false);
  });
});

describe("AI tool contracts", () => {
  it("every declared tool has a server-side schema and a permission", () => {
    for (const name of Object.keys(toolDeclarations)) {
      expect(toolArgSchemas).toHaveProperty(name);
      expect(AI_TOOL_NAMES).toContain(TOOL_PERMISSION[name as keyof typeof TOOL_PERMISSION]);
    }
  });
  it("write tools are exactly the proposal tools", () => {
    expect(WRITE_TOOLS.sort()).toEqual([
      "create_note",
      "create_plan",
      "propose_catalog_edit",
      "propose_person",
      "propose_resource",
      "update_learning_record",
    ]);
  });
  it("rejects malformed or dangerous arguments", () => {
    expect(toolArgSchemas.read_url.safeParse({ url: "file:///etc/passwd" }).success).toBe(false);
    expect(toolArgSchemas.propose_person.safeParse({ fullName: "X" }).success).toBe(false); // sources required
    expect(
      toolArgSchemas.propose_person.safeParse({
        fullName: "X",
        birthDate: "around 1900",
        sourceUrls: ["https://a.b"],
      }).success,
    ).toBe(false);
    expect(
      toolArgSchemas.update_learning_record.safeParse({ resourceId: "1; drop table" }).success,
    ).toBe(false);
    expect(toolArgSchemas.create_note.safeParse({ kind: "quote" }).success).toBe(false);
  });
});

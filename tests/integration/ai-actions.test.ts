import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { aiConversations, notes, people, suggestions } from "@/db/schema";
import { confirmAiAction, rejectAiAction } from "@/server/ai/actions";
import { createProposal } from "@/server/ai/tools";
import { hitRateLimit } from "@/server/rate-limit";
import { getAiSettings, saveAiSettings } from "@/server/settings";
import { makeUser } from "../helpers/db";

let user: Awaited<ReturnType<typeof makeUser>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
let conv: string;
let adminConv: string;

beforeAll(async () => {
  user = await makeUser(db);
  admin = await makeUser(db, { role: "superadmin" });
  conv = (
    await db.insert(aiConversations).values({ userId: user.userId, title: "t" }).returning()
  )[0].id;
  adminConv = (
    await db.insert(aiConversations).values({ userId: admin.userId, title: "t" }).returning()
  )[0].id;
});
afterAll(async () => {
  await db.$client.end();
});

describe("AI proposals", () => {
  it("nothing is written until the user confirms", async () => {
    const p = await createProposal(
      "create_note",
      { kind: "note", title: "AI note", body: "draft" },
      user,
      conv,
    );
    const before = await db.select().from(notes).where(eq(notes.userId, user.userId));
    expect(before.find((n) => n.title === "AI note")).toBeUndefined();
    const out = await confirmAiAction(user, p.actionId);
    expect(out.status).toBe("completed");
    const after = await db.select().from(notes).where(eq(notes.userId, user.userId));
    expect(after.find((n) => n.title === "AI note")?.visibility).toBe("private");
  });

  it("cannot be confirmed twice or by another user", async () => {
    const p = await createProposal("create_note", { kind: "note", body: "once" }, user, conv);
    await expect(confirmAiAction(admin, p.actionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await confirmAiAction(user, p.actionId);
    await expect(confirmAiAction(user, p.actionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejected proposals are never executed", async () => {
    const p = await createProposal(
      "create_note",
      { kind: "note", body: "rejected one" },
      user,
      conv,
    );
    await rejectAiAction(user, p.actionId);
    await expect(confirmAiAction(user, p.actionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rows = await db.select().from(notes).where(eq(notes.body, "rejected one"));
    expect(rows).toHaveLength(0);
  });

  it("a regular user's catalog proposal becomes a suggestion, never a direct write", async () => {
    const p = await createProposal(
      "propose_person",
      {
        fullName: "AI Proposed Person",
        birthDate: "1900",
        sourceUrls: ["https://example.org/bio"],
      },
      user,
      conv,
    );
    const out = await confirmAiAction(user, p.actionId);
    expect(out).toMatchObject({ status: "completed", result: { mode: "suggested" } });
    expect(
      await db.select().from(people).where(eq(people.fullName, "AI Proposed Person")),
    ).toHaveLength(0);
    const [s] = await db.select().from(suggestions).where(eq(suggestions.userId, user.userId));
    expect(s).toMatchObject({ status: "pending", origin: "ai" });
  });

  it("superadmin proposals apply directly; duplicates keep the proposal open", async () => {
    const p = await createProposal(
      "propose_person",
      { fullName: "AI Admin Person", sourceUrls: ["https://example.org/x"] },
      admin,
      adminConv,
    );
    expect((await confirmAiAction(admin, p.actionId)).status).toBe("completed");
    const dup = await createProposal(
      "propose_person",
      { fullName: "AI Admin Person", sourceUrls: ["https://example.org/x"] },
      admin,
      adminConv,
    );
    expect(dup.preview.duplicates?.length).toBeGreaterThan(0);
    const r = await confirmAiAction(admin, dup.actionId);
    expect(r).toMatchObject({ status: "failed", code: "DUPLICATE" });
    expect((await confirmAiAction(admin, dup.actionId, { allowDuplicate: true })).status).toBe(
      "completed",
    );
  });

  it("catalog edits from AI always go to review, even for superadmin", async () => {
    const [person] = await db
      .select()
      .from(people)
      .where(eq(people.fullName, "AI Admin Person"))
      .limit(1);
    const p = await createProposal(
      "propose_catalog_edit",
      {
        targetType: "person",
        targetId: person.id,
        changes: { biography: "New bio", role: "superadmin" },
        explanation: "fix",
      },
      admin,
      adminConv,
    );
    const out = await confirmAiAction(admin, p.actionId);
    expect(out).toMatchObject({ status: "completed", result: { mode: "suggested" } });
    const [fresh] = await db.select().from(people).where(eq(people.id, person.id));
    expect(fresh.biography).toBeNull();
  });

  it("tools disabled by the admin cannot be executed", async () => {
    const s = await getAiSettings(db);
    await saveAiSettings(
      db,
      { ...s, allowedTools: s.allowedTools.filter((t) => t !== "create_note") },
      admin.userId,
    );
    const p = await createProposal("create_note", { kind: "note", body: "blocked" }, user, conv);
    expect(await confirmAiAction(user, p.actionId)).toMatchObject({
      status: "failed",
      code: "FORBIDDEN",
    });
    await saveAiSettings(db, s, admin.userId);
  });

  it("invalid tool arguments are rejected server-side", async () => {
    await expect(
      createProposal("update_learning_record", { resourceId: "not-a-uuid" }, user, conv),
    ).rejects.toThrow();
    await expect(
      createProposal(
        "propose_person",
        { fullName: "X", birthDate: "circa 1900", sourceUrls: ["https://a.org"] },
        user,
        conv,
      ),
    ).rejects.toThrow();
  });
});

describe("rate limiting", () => {
  it("counts per key and window", async () => {
    const key = `test:${Date.now()}`;
    for (let i = 1; i <= 3; i++) expect((await hitRateLimit(db, key, 3, 60)).allowed).toBe(true);
    expect((await hitRateLimit(db, key, 3, 60)).allowed).toBe(false);
    const [{ n }] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from nodinest.rate_limits where key = ${key}`,
    );
    expect(n).toBe(1);
  });
});

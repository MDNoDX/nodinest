import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, withUser, type AppContext } from "@/db";
import { aiActions, aiConversations, notes, people, suggestions } from "@/db/schema";
import { confirmAiAction, rejectAiAction } from "@/server/ai/actions";
import { parseToolArgs, runTool, type ToolName } from "@/server/ai/tools";
import { saveNote } from "@/server/notes";
import { hitRateLimit } from "@/server/rate-limit";
import { getAiSettings, saveAiSettings } from "@/server/settings";
import { submitPerson } from "@/server/suggestions";
import { makeUser } from "../helpers/db";

const env = { timeZone: "Asia/Tashkent", locale: "uz" };
let user: Awaited<ReturnType<typeof makeUser>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
let conv: string;

/** Same path the assistant uses for confirm-mode tools. */
async function propose(tool: ToolName, args: unknown, ctx: AppContext = user) {
  const parsed = parseToolArgs(tool, args);
  const [row] = await withUser(db, ctx, (tx) =>
    tx
      .insert(aiActions)
      .values({ userId: ctx.userId, conversationId: conv, tool, args: parsed, status: "proposed" })
      .returning({ id: aiActions.id }),
  );
  return row.id;
}
const liveNote = (id: string) =>
  db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)));

beforeAll(async () => {
  user = await makeUser(db);
  admin = await makeUser(db, { role: "superadmin" });
  conv = (
    await db.insert(aiConversations).values({ userId: user.userId, title: "t" }).returning()
  )[0].id;
});
afterAll(async () => {
  await db.$client.end();
});

describe("AI act tools (run immediately with the user's own permissions)", () => {
  it("creates a private note", async () => {
    const out = (await runTool(
      "create_note",
      { kind: "note", noteTitle: "AI note", body: "draft" },
      user,
      env,
    )) as { href: string };
    expect(out.href).toMatch(/^\/notes\//);
    const rows = await db.select().from(notes).where(eq(notes.userId, user.userId));
    expect(rows.find((n) => n.title === "AI note")?.visibility).toBe("private");
  });

  it("a new person is created directly and owned by the creator", async () => {
    await runTool("add_person", { fullName: "AI Created Person" }, user, env);
    const [p] = await db.select().from(people).where(eq(people.fullName, "AI Created Person"));
    expect(p.createdBy).toBe(user.userId);
  });

  it("corrections to someone else's entry become a suggestion", async () => {
    const r = await submitPerson(db, admin, { fullName: "Admin Owned Person" });
    const id = (r as { id: string }).id;
    const out = await runTool(
      "suggest_correction",
      {
        targetType: "person",
        targetId: id,
        changes: { biography: "New bio", role: "superadmin" },
        explanation: "fix",
      },
      user,
      env,
    );
    expect(out).toMatchObject({ suggested: true });
    const [fresh] = await db.select().from(people).where(eq(people.id, id));
    expect(fresh.biography).toBeNull();
    const [s] = await db.select().from(suggestions).where(eq(suggestions.userId, user.userId));
    expect(s).toMatchObject({ status: "pending", origin: "ai" });
  });
});

describe("AI confirm tools (destructive)", () => {
  it("nothing is deleted until the user confirms", async () => {
    const noteId = await saveNote(db, user, { kind: "note", body: "keep me" });
    const actionId = await propose("delete_note", { noteId });
    expect(await liveNote(noteId)).toHaveLength(1);
    expect((await confirmAiAction(user, actionId, env)).status).toBe("completed");
    expect(await liveNote(noteId)).toHaveLength(0);
  });

  it("cannot be confirmed twice or by another user", async () => {
    const noteId = await saveNote(db, user, { kind: "note", body: "once" });
    const actionId = await propose("delete_note", { noteId });
    await expect(confirmAiAction(admin, actionId, env)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await confirmAiAction(user, actionId, env);
    await expect(confirmAiAction(user, actionId, env)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejected proposals are never executed", async () => {
    const noteId = await saveNote(db, user, { kind: "note", body: "rejected one" });
    const actionId = await propose("delete_note", { noteId });
    await rejectAiAction(user, actionId);
    await expect(confirmAiAction(user, actionId, env)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await liveNote(noteId)).toHaveLength(1);
  });

  it("only confirm-mode tools can be executed through confirmation", async () => {
    const actionId = await propose("create_note", { kind: "note", body: "sneaky" });
    expect(await confirmAiAction(user, actionId, env)).toMatchObject({
      status: "failed",
      code: "FORBIDDEN",
    });
  });

  it("permission groups disabled by the admin cannot be executed", async () => {
    const s = await getAiSettings(db);
    await saveAiSettings(
      db,
      { ...s, allowedTools: s.allowedTools.filter((t) => t !== "delete") },
      admin.userId,
    );
    try {
      const noteId = await saveNote(db, user, { kind: "note", body: "blocked" });
      const actionId = await propose("delete_note", { noteId });
      expect(await confirmAiAction(user, actionId, env)).toMatchObject({
        status: "failed",
        code: "FORBIDDEN",
      });
      expect(await liveNote(noteId)).toHaveLength(1);
    } finally {
      await saveAiSettings(db, s, admin.userId);
    }
  });

  it("invalid tool arguments are rejected server-side", async () => {
    await expect(propose("delete_note", { noteId: "not-a-uuid" })).rejects.toThrow();
    await expect(
      runTool("add_person", { fullName: "X", birthDate: "circa 1900" }, user, env),
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

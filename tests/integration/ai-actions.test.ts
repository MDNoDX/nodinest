import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, withUser, type AppContext } from "@/db";
import { aiActions, aiConversations, notes, people, resources } from "@/db/schema";
import { confirmAiAction, rejectAiAction } from "@/server/ai/actions";
import { parseToolArgs, runTool, toolDef, type ToolName } from "@/server/ai/tools";
import { saveNote } from "@/server/notes";
import { hitRateLimit } from "@/server/rate-limit";
import { getAiSettings, saveAiSettings } from "@/server/settings";
import { submitResource } from "@/server/suggestions";
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

describe("AI tools once confirmed (run with the user's own permissions)", () => {
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

  it("editing someone else's entry gives the user a personal copy", async () => {
    const r = await submitResource(db, admin, {
      type: "book",
      title: `Shared ${Math.random().toString(36).slice(2)}`,
    });
    const orig = (r as { id: string }).id;
    // An older shared entry that sits in this user's Darsxona.
    await db.execute(sql`insert into nodinest.learning_records (user_id, resource_id, status)
      values (${user.userId}, ${orig}, 'in_progress')`);
    await saveNote(db, user, { kind: "quote", quoteText: "Mine", resourceId: orig });
    const out = await submitResource(
      db,
      user,
      { type: "book", title: "My own edition" },
      { id: orig, allowDuplicate: true },
    );
    expect(out.mode).toBe("applied");
    const copy = (out as { id: string }).id;
    expect(copy).not.toBe(orig);
    const [o] = await db.select().from(resources).where(eq(resources.id, orig));
    expect(o.title).not.toBe("My own edition");
    const notes = await db.execute<{ resource_id: string }>(
      sql`select resource_id from nodinest.notes where user_id = ${user.userId}`,
    );
    expect(notes.map((n) => n.resource_id)).toContain(copy);
    expect(notes.map((n) => n.resource_id)).not.toContain(orig);
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
    const actionId = await propose("search_catalog", { query: "sneaky" });
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

describe("adding books: duplicate warning before anything is created", () => {
  it("the card shows the existing entry; choosing it links instead of duplicating", async () => {
    const r = await submitResource(db, user, { type: "book", title: "Odam bo‘lish qiyin" });
    const existing = (r as { id: string }).id;
    const preview = await toolDef("add_resource").preview!(
      user,
      parseToolArgs("add_resource", { type: "book", title: "Odam bo'lish qiyin" }),
    );
    const dups = preview.duplicates as { id: string; reason: string }[];
    expect(dups[0]).toMatchObject({ id: existing, reason: "same_title" });
    const actionId = await propose("add_resource", {
      type: "book",
      title: "Odam bo'lish qiyin",
      status: "completed",
    });
    const out = await confirmAiAction(user, actionId, env, { useExistingId: existing });
    expect(out).toMatchObject({ status: "completed", result: { linked: true, id: existing } });
    const [{ n }] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from nodinest.resources where nodinest.nn_norm(title) = nodinest.nn_norm(${"Odam bo'lish qiyin"})`,
    );
    expect(n).toBe(1);
    const [rec] = await db.execute<{ status: string }>(
      sql`select status::text from nodinest.learning_records where user_id = ${user.userId} and resource_id = ${existing}`,
    );
    expect(rec.status).toBe("completed");
  });
  it("without a choice an identical title is linked, never duplicated", async () => {
    const actionId = await propose("add_resource", { type: "book", title: "Odam bo’lish  qiyin" });
    const out = await confirmAiAction(user, actionId, env);
    expect(out).toMatchObject({ status: "completed", result: { linked: true } });
  });
  it("card choices cannot smuggle other arguments", async () => {
    const actionId = await propose("add_resource", { type: "book", title: "Boshqa kitob" });
    await expect(confirmAiAction(user, actionId, env, { title: "hijack" })).rejects.toThrow();
  });
});

describe("merging and deleting", () => {
  it("merge moves the user's data and archives the duplicate", async () => {
    const a = (
      (await submitResource(db, user, { type: "book", title: "Sariq devni minib" })) as {
        id: string;
      }
    ).id;
    const b = (
      (await submitResource(
        db,
        user,
        { type: "book", title: "Sariqni devni minib" },
        { allowDuplicate: true },
      )) as { id: string }
    ).id;
    await saveNote(db, user, { kind: "note", body: "dublikatdagi qayd", resourceId: b });
    const actionId = await propose("merge_resources", { keepId: a, removeIds: [b] });
    expect((await confirmAiAction(user, actionId, env)).status).toBe("completed");
    const [{ notes: moved }] = await db.execute<{ notes: number }>(
      sql`select count(*)::int as notes from nodinest.notes where resource_id = ${a} and user_id = ${user.userId}`,
    );
    expect(moved).toBe(1);
    const [arch] = await db.execute<{ deleted: boolean }>(
      sql`select deleted_at is not null as deleted from nodinest.resources where id = ${b}`,
    );
    expect(arch.deleted).toBe(true);
  });
  it("delete_resource archives the user's own entry", async () => {
    const id = (
      (await submitResource(db, user, { type: "book", title: "Xato qo‘shilgan kitob" })) as {
        id: string;
      }
    ).id;
    const actionId = await propose("delete_resource", { resourceId: id });
    expect(await confirmAiAction(user, actionId, env)).toMatchObject({
      status: "completed",
      result: { archived: true },
    });
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

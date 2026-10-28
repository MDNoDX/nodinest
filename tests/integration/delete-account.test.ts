import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { notes, resources, user } from "@/db/schema";
import { deleteAccount } from "@/server/account";
import { saveNote } from "@/server/notes";
import { submitResource } from "@/server/suggestions";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

describe("deleteAccount", () => {
  it("removes the user and their private data; shared catalog entries stay", async () => {
    const u = await makeUser(db);
    const r = await submitResource(db, u, { type: "book", title: "Delete Account Book" });
    if (r.mode !== "applied") throw new Error("expected applied");
    const noteId = await saveNote(db, u, {
      kind: "note",
      title: "x",
      body: "private",
      resourceId: r.id,
    });

    await deleteAccount({ ...u, superadminAccount: false });

    expect(await db.select().from(user).where(eq(user.id, u.userId))).toHaveLength(0);
    expect(await db.select().from(notes).where(eq(notes.id, noteId))).toHaveLength(0);
    const [res] = await db.select().from(resources).where(eq(resources.id, r.id));
    expect(res?.createdBy).toBeNull();
  });

  it("refuses the superadmin account", async () => {
    const a = await makeUser(db, { role: "superadmin" });
    await expect(deleteAccount({ ...a, superadminAccount: true })).rejects.toThrow();
    expect(await db.select().from(user).where(eq(user.id, a.userId))).toHaveLength(1);
  });
});

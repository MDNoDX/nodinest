"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { archiveCategory, saveCategory, setAdminPerms, setUserStatus } from "@/server/admin";
import { aiSettingsSchema, saveAiSettings } from "@/server/settings";
import { reviewSuggestion, withdrawSuggestion } from "@/server/suggestions";
import { AppError } from "@/lib/errors";
import { run } from "./_run";

const id = z.string().uuid();

export async function reviewSuggestionAction(
  suggestionId: string,
  decision: "approve" | "reject",
  note?: string | null,
  allowDuplicate?: boolean,
) {
  return run(async ({ ctx, db }) => {
    const out = await reviewSuggestion(
      db,
      ctx,
      id.parse(suggestionId),
      z.enum(["approve", "reject"]).parse(decision),
      z.string().max(2000).nullish().parse(note) ?? null,
      {
        allowDuplicate: !!allowDuplicate,
      },
    );
    revalidatePath("/suggestions");
    revalidatePath("/library");
    revalidatePath("/people");
    return out;
  });
}

export async function withdrawSuggestionAction(suggestionId: string) {
  return run(async ({ ctx, db }) => {
    await withdrawSuggestion(db, ctx, id.parse(suggestionId));
    revalidatePath("/suggestions");
  });
}

export async function setAdminPermsAction(userId: string, perms: string[]) {
  return run(async ({ ctx, db }) => {
    await setAdminPerms(
      db,
      ctx,
      id.parse(userId),
      z.array(z.string().max(20)).max(10).parse(perms),
    );
    revalidatePath("/admin/users");
  });
}

export async function setUserStatusAction(userId: string, status: "active" | "suspended") {
  return run(async ({ ctx, db }) => {
    await setUserStatus(db, ctx, id.parse(userId), z.enum(["active", "suspended"]).parse(status));
    revalidatePath("/admin/users");
  });
}

export async function saveCategoryAction(input: unknown, categoryId?: string | null) {
  return run(async ({ ctx, db }) => {
    const cid = await saveCategory(db, ctx, input, categoryId ? id.parse(categoryId) : undefined);
    revalidatePath("/admin/categories");
    return cid;
  });
}

export async function archiveCategoryAction(categoryId: string, archived: boolean) {
  return run(async ({ ctx, db }) => {
    await archiveCategory(db, ctx, id.parse(categoryId), !!archived);
    revalidatePath("/admin/categories");
  });
}

export async function saveAiSettingsAction(input: unknown) {
  return run(async ({ ctx, db }) => {
    if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
    const s = aiSettingsSchema.parse(input);
    await saveAiSettings(db, s, ctx.userId);
    revalidatePath("/admin/ai");
  });
}

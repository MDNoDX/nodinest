"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withUser } from "@/db";
import { user } from "@/db/schema";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { ADMIN_MODE_COOKIE } from "@/lib/auth/session";
import { isValidTimeZone } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { LEARNING_STATUSES } from "@/lib/validation";
import { indexFromFile, indexFromUrl } from "@/server/booktext";
import { createSection, deleteSection, reorderSections, updateSection } from "@/server/conspect";
import {
  deleteGoal,
  deletePlan,
  saveGoal,
  savePlan,
  setGoalStatus,
  togglePlan,
} from "@/server/goals";
import {
  deleteCollection,
  deleteNote,
  reorderCollection,
  restoreNote,
  saveCollection,
  saveNote,
  toggleCollectionItem,
} from "@/server/notes";
import { removeLearningRecord, setLearningStatus, upsertLearningRecord } from "@/server/records";
import { run } from "./_run";

const id = z.string().uuid();
const optId = z.string().uuid().nullable().optional();

// ─── Learning records ───
export async function saveRecordAction(input: unknown) {
  return run(async ({ ctx, db }) => {
    const rid = await upsertLearningRecord(db, ctx, input);
    revalidatePath("/", "layout");
    return rid;
  });
}
export async function setStatusAction(resourceId: string, status: string) {
  return run(async ({ ctx, db }) => {
    await setLearningStatus(db, ctx, id.parse(resourceId), z.enum(LEARNING_STATUSES).parse(status));
    revalidatePath("/", "layout");
  });
}
export async function removeRecordAction(resourceId: string) {
  return run(async ({ ctx, db }) => {
    await removeLearningRecord(db, ctx, id.parse(resourceId));
    revalidatePath("/", "layout");
  });
}

// ─── Konspekt ───
export async function createSectionAction(
  resourceId: string,
  input: unknown,
  afterId?: string | null,
) {
  return run(async ({ ctx, db }) => {
    const sid = await createSection(db, ctx, id.parse(resourceId), input, {
      afterId: optId.parse(afterId) ?? null,
    });
    revalidatePath(`/library/${resourceId}`, "layout");
    return sid;
  });
}
export async function updateSectionAction(sectionId: string, input: unknown) {
  return run(async ({ ctx, db }) => updateSection(db, ctx, id.parse(sectionId), input));
}
export async function deleteSectionAction(sectionId: string) {
  return run(async ({ ctx, db }) => {
    await deleteSection(db, ctx, id.parse(sectionId));
    revalidatePath("/library", "layout");
  });
}
export async function reorderSectionsAction(resourceId: string, ids: string[]) {
  return run(async ({ ctx, db }) =>
    reorderSections(db, ctx, id.parse(resourceId), z.array(id).max(1000).parse(ids)),
  );
}

// ─── Book text (PDF / reading link) ───
export async function indexFileAction(resourceId: string, fileId: string) {
  return run(async ({ ctx }) => {
    const r = await indexFromFile(ctx, id.parse(resourceId), id.parse(fileId));
    revalidatePath(`/library/${resourceId}`);
    return r;
  });
}
export async function indexUrlAction(resourceId: string, url: string) {
  return run(async ({ ctx }) => {
    const r = await indexFromUrl(ctx, id.parse(resourceId), z.string().url().max(2048).parse(url));
    revalidatePath(`/library/${resourceId}`);
    return r;
  });
}

// ─── Notes ───
export async function saveNoteAction(input: unknown, noteId?: string | null) {
  return run(async ({ ctx, db }) => {
    const nid = await saveNote(db, ctx, input, optId.parse(noteId) ?? undefined);
    revalidatePath("/notes");
    revalidatePath(`/notes/${nid}`);
    return nid;
  });
}
export async function deleteNoteAction(noteId: string) {
  return run(async ({ ctx, db }) => {
    await deleteNote(db, ctx, id.parse(noteId));
    revalidatePath("/notes");
  });
}
export async function restoreNoteAction(noteId: string) {
  return run(async ({ ctx, db }) => {
    await restoreNote(db, ctx, id.parse(noteId));
    revalidatePath("/notes");
  });
}

// ─── Collections ───
export async function saveCollectionAction(input: unknown, collectionId?: string | null) {
  return run(async ({ ctx, db }) => {
    const cid = await saveCollection(db, ctx, input, optId.parse(collectionId) ?? undefined);
    revalidatePath("/collections", "layout");
    return cid;
  });
}
export async function deleteCollectionAction(collectionId: string) {
  return run(async ({ ctx, db }) => {
    await deleteCollection(db, ctx, id.parse(collectionId));
    revalidatePath("/collections");
  });
}
export async function toggleCollectionItemAction(
  collectionId: string,
  target: { resourceId?: string; noteId?: string },
  add: boolean,
) {
  return run(async ({ ctx, db }) => {
    const t = z
      .object({ resourceId: z.string().uuid().optional(), noteId: z.string().uuid().optional() })
      .parse(target);
    await toggleCollectionItem(db, ctx, id.parse(collectionId), t, !!add);
    revalidatePath("/collections", "layout");
  });
}
export async function reorderCollectionAction(collectionId: string, itemIds: string[]) {
  return run(async ({ ctx, db }) => {
    await reorderCollection(db, ctx, id.parse(collectionId), z.array(id).max(1000).parse(itemIds));
    revalidatePath(`/collections/${collectionId}`);
  });
}

// ─── Goals & plans ───
export async function saveGoalAction(input: unknown, goalId?: string | null) {
  return run(async ({ ctx, db }) => {
    const gid = await saveGoal(db, ctx, input, optId.parse(goalId) ?? undefined);
    revalidatePath("/plans");
    revalidatePath("/");
    return gid;
  });
}
export async function setGoalStatusAction(goalId: string, status: string) {
  return run(async ({ ctx, db }) => {
    await setGoalStatus(
      db,
      ctx,
      id.parse(goalId),
      z.enum(["active", "achieved", "archived"]).parse(status),
    );
    revalidatePath("/plans");
  });
}
export async function deleteGoalAction(goalId: string) {
  return run(async ({ ctx, db }) => {
    await deleteGoal(db, ctx, id.parse(goalId));
    revalidatePath("/plans");
  });
}
export async function savePlanAction(input: unknown, planId?: string | null) {
  return run(async ({ ctx, db }) => {
    const pid = await savePlan(db, ctx, input, optId.parse(planId) ?? undefined);
    revalidatePath("/plans");
    revalidatePath("/");
    return pid;
  });
}
export async function togglePlanAction(planId: string, done: boolean) {
  return run(async ({ ctx, db }) => {
    await togglePlan(db, ctx, id.parse(planId), !!done);
    revalidatePath("/plans");
    revalidatePath("/");
  });
}
export async function deletePlanAction(planId: string) {
  return run(async ({ ctx, db }) => {
    await deletePlan(db, ctx, id.parse(planId));
    revalidatePath("/plans");
  });
}

// ─── Preferences ───
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return { ok: false as const, code: "VALIDATION" as const };
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return run(async ({ ctx, db }) => {
    await withUser(db, ctx, (tx) => tx.update(user).set({ locale }).where(eq(user.id, ctx.userId)));
    revalidatePath("/", "layout");
  });
}

/** Superadmin only: switch between normal use and admin mode. */
export async function setAdminModeAction(on: boolean) {
  return run(async ({ user: u }) => {
    if (!u.isSuperadmin) throw new AppError("FORBIDDEN");
    const store = await cookies();
    if (on)
      store.set(ADMIN_MODE_COOKIE, "1", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 12,
      });
    else store.delete(ADMIN_MODE_COOKIE);
    revalidatePath("/", "layout");
    return { adminMode: !!on };
  });
}

export async function saveProfileAction(input: { name: string; timezone: string }) {
  return run(async ({ ctx, db }) => {
    const p = z
      .object({ name: z.string().trim().min(1).max(100), timezone: z.string().max(64) })
      .parse(input);
    if (!isValidTimeZone(p.timezone)) throw new AppError("VALIDATION", "invalid_timezone");
    await withUser(db, ctx, (tx) =>
      tx.update(user).set({ name: p.name, timezone: p.timezone }).where(eq(user.id, ctx.userId)),
    );
    revalidatePath("/", "layout");
  });
}

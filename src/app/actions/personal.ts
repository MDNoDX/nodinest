"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withUser } from "@/db";
import { user } from "@/db/schema";
import { isValidTimeZone } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { cookies } from "next/headers";
import {
  deletePlan,
  deleteGoal,
  saveGoal,
  savePlan,
  setGoalStatus,
  togglePlan,
} from "@/server/goals";
import {
  deleteSession,
  discardOpenSession,
  finishSession,
  pauseSession,
  removeLearningRecord,
  resumeSession,
  saveManualSession,
  setLearningStatus,
  startSession,
  upsertLearningRecord,
} from "@/server/journal";
import {
  deleteCollection,
  deleteNote,
  restoreNote,
  saveCollection,
  saveNote,
  toggleCollectionItem,
} from "@/server/notes";
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
    await setLearningStatus(
      db,
      ctx,
      id.parse(resourceId),
      z.enum(["planned", "in_progress", "completed", "paused", "abandoned"]).parse(status),
    );
    revalidatePath("/", "layout");
  });
}
export async function removeRecordAction(resourceId: string) {
  return run(async ({ ctx, db }) => {
    await removeLearningRecord(db, ctx, id.parse(resourceId));
    revalidatePath("/", "layout");
  });
}

// ─── Sessions ───
export async function startSessionAction(resourceId: string | null) {
  return run(async ({ ctx, db }) => {
    const sid = await startSession(db, ctx, optId.parse(resourceId) ?? null);
    revalidatePath("/", "layout");
    return sid;
  });
}
export async function pauseSessionAction(sessionId: string) {
  return run(async ({ ctx, db }) => {
    await pauseSession(db, ctx, id.parse(sessionId));
    revalidatePath("/", "layout");
  });
}
export async function resumeSessionAction(sessionId: string) {
  return run(async ({ ctx, db }) => {
    await resumeSession(db, ctx, id.parse(sessionId));
    revalidatePath("/", "layout");
  });
}
export async function finishSessionAction(
  sessionId: string,
  extra: { note?: string | null; progressTo?: number | null },
) {
  return run(async ({ ctx, db }) => {
    const e = z
      .object({
        note: z.string().trim().max(10_000).nullish(),
        progressTo: z.number().int().min(0).max(1_000_000).nullish(),
      })
      .parse(extra);
    const out = await finishSession(db, ctx, id.parse(sessionId), {
      note: e.note || null,
      progressTo: e.progressTo ?? null,
    });
    revalidatePath("/", "layout");
    return out;
  });
}
export async function discardSessionAction(sessionId: string) {
  return run(async ({ ctx, db }) => {
    await discardOpenSession(db, ctx, id.parse(sessionId));
    revalidatePath("/", "layout");
  });
}
export async function saveManualSessionAction(input: unknown, sessionId?: string | null) {
  return run(async ({ ctx, db }) => {
    const sid = await saveManualSession(db, ctx, input, optId.parse(sessionId) ?? undefined);
    revalidatePath("/", "layout");
    return sid;
  });
}
export async function deleteSessionAction(sessionId: string) {
  return run(async ({ ctx, db }) => {
    await deleteSession(db, ctx, id.parse(sessionId));
    revalidatePath("/", "layout");
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
    revalidatePath("/collections");
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
    revalidatePath("/collections");
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

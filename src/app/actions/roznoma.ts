"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  addGoalStep,
  checkRoutine,
  createGoal,
  deleteRoutines,
  reorderRoutines,
  resolveGoal,
  saveDayLog,
  saveRoutine,
  setArchived,
  setGoalStep,
  syncDay,
} from "@/server/roznoma";
import { run } from "./_run";

const fresh = () => {
  revalidatePath("/plans");
  revalidatePath("/");
};

export async function saveRoutineAction(input: unknown, id?: string | null) {
  return run(async ({ ctx }) => {
    const out = await saveRoutine(ctx, input, id ?? undefined);
    fresh();
    return out;
  });
}

export async function setArchivedAction(ids: string[], archived: boolean, day?: string) {
  return run(async ({ ctx }) => {
    await setArchived(ctx, ids, archived, day);
    fresh();
  });
}

export async function deleteRoutinesAction(ids: string[]) {
  return run(async ({ ctx }) => {
    await deleteRoutines(ctx, ids);
    fresh();
  });
}

export async function reorderRoutinesAction(ids: string[]) {
  return run(async ({ ctx }) => {
    await reorderRoutines(ctx, ids);
  });
}

/** Ticks are instant on the client: no page refresh is needed. */
export async function checkRoutineAction(
  id: string,
  day: string,
  state: {
    status: "done" | "partial" | "skipped" | null;
    value?: number | null;
    note?: string | null;
  },
) {
  return run(async ({ ctx }) => {
    await checkRoutine(ctx, id, day, state);
    revalidatePath("/");
  });
}

/** The day's ticks go into the year's book (called a moment after the last tick). */
export async function syncDayAction(day: string) {
  return run(async ({ ctx }) => syncDay(ctx, day, await getLocale()));
}

export async function saveDayLogAction(day: string, input: unknown) {
  return run(async ({ ctx }) => {
    const out = await saveDayLog(ctx, day, input, await getLocale());
    revalidatePath("/write");
    return out;
  });
}

export async function createGoalAction(input: unknown) {
  return run(async ({ ctx }) => {
    const id = await createGoal(ctx, input);
    fresh();
    return id;
  });
}

export async function addGoalStepAction(goalId: string, input: unknown) {
  return run(async ({ ctx }) => {
    const id = await addGoalStep(ctx, goalId, input);
    revalidatePath("/");
    return id;
  });
}

export async function setGoalStepAction(stepId: string, done: boolean | null) {
  return run(async ({ ctx }) => {
    const out = await setGoalStep(ctx, stepId, done);
    revalidatePath("/");
    return out;
  });
}

export async function resolveGoalAction(id: string, reached: boolean) {
  return run(async ({ ctx }) => {
    await resolveGoal(ctx, id, reached);
    fresh();
  });
}

/** Where prayer times are computed for (rounded: about a kilometre is enough). */
export async function savePlaceAction(lat: number, lng: number) {
  return run(async ({ ctx }) => {
    const a = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
    const p = a.parse({ lat, lng });
    await db
      .update(user)
      .set({ lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 })
      .where(eq(user.id, ctx.userId));
    fresh();
  });
}

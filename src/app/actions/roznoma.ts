"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import {
  addGoalStep,
  checkRoutine,
  createGoal,
  deleteRoutines,
  reorderRoutines,
  removeGoal,
  reopenGoal,
  resolveGoal,
  updateGoal,
  saveDayLog,
  saveRoutine,
  setArchived,
  setGoalStep,
  syncDay,
  rebuildYearBook,
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

/** Every day of the year written into its book again, in the new layout. */
export async function rebuildYearBookAction(year: string) {
  return run(async ({ ctx }) => {
    const out = await rebuildYearBook(ctx, year, await getLocale());
    revalidatePath("/write");
    return out;
  });
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

export async function updateGoalAction(id: string, input: unknown) {
  return run(async ({ ctx }) => {
    await updateGoal(ctx, id, input);
    fresh();
  });
}

export async function removeGoalAction(id: string) {
  return run(async ({ ctx }) => {
    await removeGoal(ctx, id);
    fresh();
  });
}

export async function reopenGoalAction(id: string) {
  return run(async ({ ctx }) => {
    await reopenGoal(ctx, id);
    fresh();
  });
}

export async function resolveGoalAction(id: string, reached: boolean) {
  return run(async ({ ctx }) => {
    await resolveGoal(ctx, id, reached);
    fresh();
  });
}

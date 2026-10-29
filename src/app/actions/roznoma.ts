"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import {
  addGoalStep,
  checkRoutine,
  createStepGoal,
  deleteRoutine,
  reorderRoutines,
  saveDayLog,
  saveRoutine,
  setGoalStep,
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

export async function deleteRoutineAction(id: string) {
  return run(async ({ ctx }) => {
    await deleteRoutine(ctx, id);
    fresh();
  });
}

export async function reorderRoutinesAction(ids: string[]) {
  return run(async ({ ctx }) => {
    await reorderRoutines(ctx, ids);
  });
}

/** Ticks are instant on the client: no page refresh is needed. */
export async function checkRoutineAction(id: string, day: string, done: boolean, note?: string) {
  return run(async ({ ctx }) => {
    await checkRoutine(ctx, id, day, done, note);
    revalidatePath("/");
  });
}

export async function saveDayLogAction(day: string, input: unknown) {
  return run(async ({ ctx }) => {
    const out = await saveDayLog(ctx, day, input, await getLocale());
    revalidatePath("/write");
    return out;
  });
}

export async function createStepGoalAction(input: {
  title: string;
  note?: string | null;
  steps: string[];
}) {
  return run(async ({ ctx }) => {
    const id = await createStepGoal(ctx, input);
    fresh();
    return id;
  });
}

export async function addGoalStepAction(goalId: string, title: string) {
  return run(async ({ ctx }) => {
    const id = await addGoalStep(ctx, goalId, title);
    fresh();
    return id;
  });
}

export async function setGoalStepAction(stepId: string, done: boolean | null) {
  return run(async ({ ctx }) => {
    await setGoalStep(ctx, stepId, done);
    fresh();
  });
}

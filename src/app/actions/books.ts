"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { createOwnBook, deleteOwnBook, setOwnBookGoal, updateOwnBook } from "@/server/own-books";
import { run } from "./_run";
import { asLocale } from "@/i18n/config";

const id = z.string().uuid();

export async function createOwnBookAction(input: unknown) {
  return run(async ({ ctx }) => {
    const bookId = await createOwnBook(ctx, {
      ...(input as object),
      locale: asLocale(await getLocale()),
    });
    revalidatePath("/write");
    return bookId;
  });
}
export async function setOwnBookGoalAction(bookId: string, goal: number | null) {
  return run(async ({ ctx }) => {
    await setOwnBookGoal(ctx, id.parse(bookId), goal);
    revalidatePath(`/write/${bookId}`);
  });
}
export async function deleteOwnBookAction(bookId: string) {
  return run(async ({ ctx }) => {
    await deleteOwnBook(ctx, id.parse(bookId));
    revalidatePath("/write");
  });
}
export async function updateOwnBookAction(bookId: string, input: unknown) {
  return run(async ({ ctx }) => {
    await updateOwnBook(ctx, id.parse(bookId), input);
    revalidatePath("/write");
    revalidatePath(`/write/${bookId}`);
  });
}

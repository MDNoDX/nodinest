"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { createOwnBook, deleteOwnBook, setOwnBookGoal } from "@/server/own-books";
import { run } from "./_run";

const id = z.string().uuid();

export async function createOwnBookAction(input: unknown) {
  return run(async ({ ctx }) => {
    const bookId = await createOwnBook(ctx, {
      ...(input as object),
      locale: (await getLocale()) === "en" ? "en" : "uz",
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

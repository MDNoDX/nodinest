"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendFeedback, setFeedbackStatus } from "@/server/feedback";
import { run } from "./_run";

export async function sendFeedbackAction(input: unknown) {
  return run(async ({ ctx }) => {
    await sendFeedback(ctx, input);
    revalidatePath("/suggestions");
  });
}
export async function setFeedbackStatusAction(id: string, status: string) {
  return run(async ({ ctx }) => {
    await setFeedbackStatus(ctx, id, z.enum(["new", "read", "done"]).parse(status));
    revalidatePath("/suggestions");
  });
}

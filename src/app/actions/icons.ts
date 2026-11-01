"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addCustomIcon, removeCustomIcon } from "@/server/custom-icons";
import { run } from "./_run";

export async function addIconAction(input: { icon: string; name: string; words: string }) {
  return run(async ({ ctx }) => {
    const { id, name, words } = await addCustomIcon(ctx, input);
    revalidatePath("/admin/icons");
    return { id, name, words };
  });
}

export async function removeIconAction(id: string) {
  return run(async ({ ctx }) => {
    await removeCustomIcon(
      ctx,
      z
        .string()
        .regex(/^[a-f0-9]{12}$/)
        .parse(id),
    );
    revalidatePath("/admin/icons");
  });
}

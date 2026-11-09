"use server";
import { z } from "zod";
import { grabPicture, removeIcon, resetIcon, saveIcon, saveIconOrder } from "@/server/plan-icons";
import { run } from "./_run";

// Every action answers with the whole new index, so the page shows exactly what is stored.

export async function saveIconAction(input: {
  key: string;
  name?: string;
  words?: string;
  picture?: { type: string; data: string };
}) {
  return run(({ ctx }) => saveIcon(ctx, input));
}

export async function resetIconAction(key: string) {
  return run(({ ctx }) => resetIcon(ctx, z.string().max(20).parse(key)));
}

export async function removeIconAction(id: string) {
  return run(({ ctx }) =>
    removeIcon(
      ctx,
      z
        .string()
        .regex(/^[a-f0-9]{12}$/)
        .parse(id),
    ),
  );
}

export async function saveIconOrderAction(order: string[] | null) {
  return run(({ ctx }) => saveIconOrder(ctx, order));
}

/** A picture from a pasted link, cleaned, for the preview before saving. */
export async function grabIconAction(url: string) {
  return run(({ ctx }) => grabPicture(ctx, url));
}

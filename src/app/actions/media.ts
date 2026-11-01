"use server";
import { z } from "zod";
import { mediaFeed } from "@/server/social";
import { run } from "./_run";

export async function moreMediaAction(kind: string, before: string) {
  return run(async ({ ctx }) =>
    mediaFeed(ctx, {
      kind: z.string().max(20).parse(kind),
      before: z.string().max(60).parse(before),
    }),
  );
}

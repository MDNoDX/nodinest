"use server";
import { z } from "zod";
import { mediaFeed } from "@/server/social";
import { runOpen } from "./_run";

export async function moreMediaAction(scope: string, kind: string, before: string) {
  return runOpen(async ({ ctx }) =>
    mediaFeed(ctx, {
      scope: z.string().max(20).parse(scope),
      kind: z.string().max(20).parse(kind),
      before: z.string().max(60).parse(before),
    }),
  );
}

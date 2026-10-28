"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { analyzeAudiobook, setVoice } from "@/server/audiobook";
import { run } from "./_run";
import { asLocale } from "@/i18n/config";

const id = z.string().uuid();

/** Reads the whole book and prepares the audiobook (can take a minute or two). */
export async function analyzeAudiobookAction(resourceId: string) {
  return run(async ({ ctx }) => {
    const locale = asLocale(await getLocale());
    const r = await analyzeAudiobook(ctx, id.parse(resourceId), locale);
    revalidatePath(`/library/${resourceId}/audiobook`);
    return r;
  });
}

export async function setVoiceAction(resourceId: string, speaker: string, voice: string) {
  return run(async ({ ctx }) =>
    setVoice(
      ctx,
      id.parse(resourceId),
      z.string().max(120).parse(speaker),
      z.string().max(40).parse(voice),
    ),
  );
}

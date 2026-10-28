"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { confirmAiAction, rejectAiAction } from "@/server/ai/actions";
import { deleteConversation, runAssistant } from "@/server/ai/assistant";
import { transcribeAudio } from "@/server/ai/media";
import { askAboutSelection, transcribeClip, transcribeSegment, writeHelp } from "@/server/ai/study";
import {
  deleteTranscript,
  listTranscripts,
  startTranscript,
  stepTranscript,
  transcriptText,
} from "@/server/ai/transcripts";
import { run } from "./_run";

export async function askAssistantAction(input: {
  conversationId?: string | null;
  message: string;
  attachments?: string[];
  mode?: "act" | "talk";
}) {
  return run(async ({ ctx, user }) => {
    const p = z
      .object({
        conversationId: z.string().uuid().nullish(),
        message: z.string().trim().max(6000),
        attachments: z.array(z.string().uuid()).max(6).default([]),
        mode: z.enum(["act", "talk"]).default("act"),
      })
      .refine((v) => v.message.length > 0 || v.attachments.length > 0)
      .parse(input);
    return runAssistant(ctx, {
      conversationId: p.conversationId ?? null,
      message: p.message,
      attachments: p.attachments,
      mode: p.mode,
      locale: await getLocale(),
      timeZone: user.timezone,
    });
  });
}

/** Runs a proposal the user confirmed (optionally with a choice made on its card). */
export async function confirmAiActionAction(actionId: string, choice?: unknown) {
  return run(async ({ ctx, user }) => {
    const out = await confirmAiAction(
      ctx,
      z.string().uuid().parse(actionId),
      { timeZone: user.timezone, locale: await getLocale() },
      choice,
    );
    revalidatePath("/", "layout");
    return out;
  });
}

export async function rejectAiActionAction(actionId: string) {
  return run(async ({ ctx }) => rejectAiAction(ctx, z.string().uuid().parse(actionId)));
}

export async function deleteConversationAction(conversationId: string) {
  return run(async ({ ctx }) => deleteConversation(ctx, z.string().uuid().parse(conversationId)));
}

/** Voice note → text (the user decides whether to keep the audio, the text, or both). */
export async function transcribeAudioAction(fileId: string) {
  return run(async ({ ctx }) => ({
    text: await transcribeAudio(ctx, z.string().uuid().parse(fileId)),
  }));
}

/** Taqriz: explain the selected word / passage (side panel). */
export async function askAboutSelectionAction(input: unknown) {
  return run(async ({ ctx }) =>
    askAboutSelection(ctx, { ...(input as object), locale: await getLocale() }),
  );
}

/** Taqriz: write out one stretch of the video / audio being played. */
export async function transcribeSegmentAction(input: unknown) {
  return run(async ({ ctx }) =>
    transcribeSegment(ctx, { ...(input as object), locale: await getLocale() }),
  );
}

// ── Full transcripts / konspekts (prepared ahead, downloadable) ──
export async function startTranscriptAction(input: unknown) {
  return run(async ({ ctx }) => startTranscript(ctx, input));
}
export async function stepTranscriptAction(id: string) {
  return run(async ({ ctx }) =>
    stepTranscript(ctx, z.string().uuid().parse(id), await getLocale()),
  );
}
export async function listTranscriptsAction(resourceId: string) {
  return run(async ({ ctx }) => listTranscripts(ctx, z.string().uuid().parse(resourceId)));
}
export async function deleteTranscriptAction(id: string) {
  return run(async ({ ctx }) => deleteTranscript(ctx, z.string().uuid().parse(id)));
}
export async function transcriptTextAction(id: string) {
  return run(async ({ ctx }) => transcriptText(ctx, z.string().uuid().parse(id)));
}

/** Taqriz: AI drafts a part (outline, intro, continue, conclusion, improve, custom). */
export async function writeHelpAction(input: unknown) {
  return run(async ({ ctx }) =>
    writeHelp(ctx, { ...(input as object), locale: await getLocale() }),
  );
}

/** Dictation (interview answers): a recorded clip → text. */
export async function transcribeClipAction(input: unknown) {
  return run(async ({ ctx }) =>
    transcribeClip(ctx, { ...(input as object), locale: await getLocale() }),
  );
}

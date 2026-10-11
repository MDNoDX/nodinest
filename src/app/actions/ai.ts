"use server";
import { z } from "zod";
import { confirmAiAction, rejectAiAction } from "@/server/ai/actions";
import { deleteConversation, runAssistant } from "@/server/ai/assistant";
import { getLocale } from "next-intl/server";
import { run } from "./_run";

export async function askAssistantAction(input: {
  conversationId?: string | null;
  message: string;
}) {
  return run(async ({ ctx, user }) => {
    const p = z
      .object({ conversationId: z.string().uuid().nullish(), message: z.string().min(1).max(4000) })
      .parse(input);
    return runAssistant(ctx, {
      conversationId: p.conversationId ?? null,
      message: p.message,
      locale: await getLocale(),
      timeZone: user.timezone,
    });
  });
}

export async function confirmAiActionAction(actionId: string, allowDuplicate?: boolean) {
  return run(async ({ ctx }) =>
    confirmAiAction(ctx, z.string().uuid().parse(actionId), { allowDuplicate: !!allowDuplicate }),
  );
}

export async function rejectAiActionAction(actionId: string) {
  return run(async ({ ctx }) => rejectAiAction(ctx, z.string().uuid().parse(actionId)));
}

export async function deleteConversationAction(conversationId: string) {
  return run(async ({ ctx }) => deleteConversation(ctx, z.string().uuid().parse(conversationId)));
}

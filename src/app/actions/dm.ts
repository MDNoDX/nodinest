"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  deleteMessage,
  openThread,
  searchMessages,
  sendMessage,
  setBlocked,
  takeShared,
} from "@/server/dm";
import { searchPeople } from "@/server/social";
import { run } from "./_run";

export async function openThreadAction(username: string) {
  return run(async ({ ctx }) => openThread(ctx, z.string().max(60).parse(username)));
}

export async function sendMessageAction(
  threadId: string,
  input: { body?: string; fileId?: string; resourceId?: string; replyToId?: string },
) {
  return run(async ({ ctx }) => sendMessage(ctx, threadId, input));
}

/** Sends an item to someone by username (the "Send" sheet on a card). */
export async function shareToAction(username: string, resourceId: string, body?: string) {
  return run(async ({ ctx }) => {
    const threadId = await openThread(ctx, z.string().max(60).parse(username));
    await sendMessage(ctx, threadId, { resourceId, body: body || undefined });
    return threadId;
  });
}

export async function deleteMessageAction(messageId: string) {
  return run(async ({ ctx }) => deleteMessage(ctx, messageId));
}

export async function setBlockedAction(userId: string, on: boolean) {
  return run(async ({ ctx }) => {
    await setBlocked(ctx, userId, on === true);
    revalidatePath("/chats", "layout");
  });
}

export async function takeSharedAction(messageId: string) {
  return run(async ({ ctx }) => {
    const id = await takeShared(ctx, messageId);
    revalidatePath("/library");
    return id;
  });
}

/** The search over the chat list: people (to start a talk) and words in my talks. */
export async function searchChatsAction(q: string) {
  return run(async ({ ctx }) => {
    const k = z.string().max(60).parse(q);
    const [people, messages] = await Promise.all([searchPeople(ctx, k), searchMessages(ctx, k)]);
    return { people: [...people], messages };
  });
}

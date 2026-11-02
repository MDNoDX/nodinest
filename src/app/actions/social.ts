"use server";
import { revalidatePath } from "next/cache";
import {
  answerFollowRequest,
  follow,
  removeFollower,
  setItemVisibility,
  setProfilePublic,
  setShared,
  takeSource,
  setLike,
  listPostComments,
  addComment,
  deleteComment,
} from "@/server/social";
import { z } from "zod";
import { run, runOpen } from "./_run";

export async function followAction(userId: string, on: boolean) {
  return run(async ({ ctx }) => {
    const state = await follow(ctx, userId, on);
    revalidatePath("/u", "layout");
    return state;
  });
}

export async function answerFollowRequestAction(userId: string, accept: boolean) {
  return run(async ({ ctx }) => {
    await answerFollowRequest(ctx, userId, !!accept);
    revalidatePath("/notifications");
    revalidatePath("/u", "layout");
  });
}

export async function setSharedAction(
  resourceId: string,
  what: "writeup" | "audiobook",
  on: boolean,
) {
  return run(async ({ ctx }) => {
    await setShared(ctx, resourceId, what === "audiobook" ? "audiobook" : "writeup", on === true);
    revalidatePath("/library");
  });
}

export async function takeSourceAction(resourceId: string, ownerId: string) {
  return run(async ({ ctx }) => {
    await takeSource(ctx, resourceId, ownerId);
    revalidatePath("/library");
  });
}

export async function setProfilePublicAction(on: boolean, bio: string | null) {
  return run(async ({ ctx }) => {
    await setProfilePublic(ctx, on, bio);
    revalidatePath("/", "layout");
  });
}

export async function setItemVisibilityAction(
  resourceId: string,
  pub: boolean,
  extras?: { writeup?: boolean; audiobook?: boolean; text?: boolean },
) {
  return run(async ({ ctx }) => {
    const e = z
      .object({
        writeup: z.boolean().optional(),
        audiobook: z.boolean().optional(),
        text: z.boolean().optional(),
      })
      .parse(extras ?? {});
    await setItemVisibility(ctx, resourceId, pub === true, e);
    // The switch flips on the client at once; only profiles need fresh data.
    revalidatePath("/u", "layout");
  });
}

export async function removeFollowerAction(userId: string) {
  return run(async ({ ctx }) => {
    await removeFollower(ctx, userId);
    revalidatePath("/u", "layout");
  });
}

export async function setLikeAction(recordId: string, on: boolean) {
  return run(async ({ ctx }) => setLike(ctx, recordId, on === true));
}

export async function postCommentsAction(recordId: string) {
  return runOpen(async ({ ctx }) => listPostComments(ctx, recordId));
}

export async function addCommentAction(
  recordId: string,
  input: { body?: string; gif?: { id: string; url: string; w: number; h: number } },
) {
  return run(async ({ ctx }) => {
    await addComment(ctx, recordId, input);
    return listPostComments(ctx, recordId);
  });
}

export async function deleteCommentAction(commentId: string) {
  return run(async ({ ctx }) => deleteComment(ctx, commentId));
}

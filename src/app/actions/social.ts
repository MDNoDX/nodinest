"use server";
import {
  likers,
  myActivity,
  removeActivity,
  setCommentLike,
  type ActivityKind,
  type ActivityQuery,
} from "@/server/activity";
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
  countShare,
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

/** A public post was sent on: counted for its owner (not a write anyone sees except as a number). */
export async function countShareAction(recordId: string, n: number) {
  return run(async ({ ctx }) => countShare(ctx, recordId, Number(n) || 1));
}

export async function postCommentsAction(recordId: string) {
  return runOpen(async ({ ctx }) => listPostComments(ctx, recordId));
}

export async function addCommentAction(
  recordId: string,
  input: { body?: string; gif?: { id: string; url: string; w: number; h: number } },
  replyTo?: string | null,
) {
  return run(async ({ ctx }) => {
    const id = await addComment(ctx, recordId, input, replyTo ?? null);
    return { id, list: await listPostComments(ctx, recordId) };
  });
}

export async function setCommentLikeAction(commentId: string, on: boolean) {
  return run(async ({ ctx }) => setCommentLike(ctx, commentId, on === true));
}

/** Who liked a post or a comment (guests may look at public posts too). */
export async function likersAction(kind: "post" | "comment", id: string) {
  return runOpen(async ({ ctx }) => likers(ctx, kind === "comment" ? "comment" : "post", id));
}

export async function myActivityAction(q: ActivityQuery) {
  return run(async ({ ctx }) => myActivity(ctx, q));
}

export async function removeActivityAction(kind: ActivityKind, ids: string[]) {
  return run(async ({ ctx }) => removeActivity(ctx, kind, ids));
}

export async function deleteCommentAction(commentId: string) {
  return run(async ({ ctx }) => deleteComment(ctx, commentId));
}

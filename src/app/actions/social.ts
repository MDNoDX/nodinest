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
} from "@/server/social";
import { run } from "./_run";

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

export async function setItemVisibilityAction(resourceId: string, pub: boolean) {
  return run(async ({ ctx }) => {
    await setItemVisibility(ctx, resourceId, pub);
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

"use server";
import { revalidatePath } from "next/cache";
import { follow, removeFollower, setItemVisibility, setProfilePublic } from "@/server/social";
import { run } from "./_run";

export async function followAction(userId: string, on: boolean) {
  return run(async ({ ctx }) => {
    await follow(ctx, userId, on);
    revalidatePath("/u", "layout");
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

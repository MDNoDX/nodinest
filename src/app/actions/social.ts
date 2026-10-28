"use server";
import { revalidatePath } from "next/cache";
import { follow, setItemVisibility, setProfilePublic } from "@/server/social";
import { run } from "./_run";

export async function followAction(userId: string, on: boolean) {
  return run(async ({ ctx }) => {
    await follow(ctx, userId, on);
    revalidatePath("/community");
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
    revalidatePath(`/library/${resourceId}`);
  });
}

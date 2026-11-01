"use server";
import { revalidatePath } from "next/cache";
import { run } from "./_run";
import { type NotifyKey } from "@/lib/notify-prefs";
import {
  botLinkCode,
  deleteNotifications,
  markAllRead,
  setNotifyPref,
  unlinkBot,
} from "@/server/notifications";

export async function markReadAction() {
  return run(async ({ ctx }) => {
    await markAllRead(ctx);
    revalidatePath("/", "layout");
  });
}

export async function deleteNotificationsAction(ids: string[]) {
  return run(async ({ ctx }) => {
    await deleteNotifications(ctx, ids);
    revalidatePath("/notifications");
  });
}

export async function setNotifyPrefAction(key: NotifyKey, on: boolean) {
  return run(async ({ ctx }) => {
    await setNotifyPref(ctx, key, !!on);
    revalidatePath("/", "layout");
  });
}

export async function botLinkAction() {
  return run(async ({ ctx }) => `https://t.me/nodinest_bot?start=link_${botLinkCode(ctx.userId)}`);
}

export async function unlinkBotAction() {
  return run(async ({ ctx }) => {
    await unlinkBot(ctx);
    revalidatePath("/settings");
  });
}

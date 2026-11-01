"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/errors";
import {
  changePassword,
  loginWithPassword,
  removeDevice,
  setFirstPassword,
  syncTimezone,
} from "@/server/account-security";
import { confirmReset, requestReset } from "@/server/password-reset";
import { run } from "./_run";

/** Before a session exists, so outside run(). */
export async function loginAction(login: string, password: string): Promise<ActionResult<null>> {
  try {
    await loginWithPassword(z.string().min(1).max(120).parse(login), z.string().parse(password));
    return { ok: true, data: null };
  } catch (err) {
    return toActionError(err);
  }
}

/** Also before a session: the same answer whether or not the account exists. */
export async function requestResetAction(login: string): Promise<ActionResult<null>> {
  try {
    await requestReset(z.string().trim().min(1).max(120).parse(login));
    return { ok: true, data: null };
  } catch (err) {
    return toActionError(err);
  }
}

export async function confirmResetAction(
  login: string,
  code: string,
  password: string,
): Promise<ActionResult<null>> {
  try {
    await confirmReset(
      z.string().trim().min(1).max(120).parse(login),
      z.string().max(12).parse(code),
      z.string().max(200).parse(password),
    );
    return { ok: true, data: null };
  } catch (err) {
    return toActionError(err);
  }
}

export async function setPasswordAction(password: string) {
  return run(async ({ ctx }) => {
    await setFirstPassword(ctx, z.string().max(200).parse(password));
    revalidatePath("/settings");
  });
}

export async function changePasswordAction(current: string, next: string) {
  return run(async ({ ctx }) => {
    await changePassword(ctx, z.string().max(200).parse(current), z.string().max(200).parse(next));
  });
}

export async function removeDeviceAction(id: string) {
  return run(async ({ ctx }) => {
    await removeDevice(ctx, z.string().uuid().parse(id));
    revalidatePath("/settings");
  });
}

export async function syncTimezoneAction(tz: string) {
  return run(async ({ ctx }) => syncTimezone(ctx, z.string().max(64).parse(tz)));
}

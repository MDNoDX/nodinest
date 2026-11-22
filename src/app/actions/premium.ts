"use server";
import { can } from "@/lib/admin-perms";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { saveAds } from "@/server/ads";
import { decidePayment, requestPayment, savePremiumSettings } from "@/server/premium";
import { starsInvoiceLink } from "@/server/stars";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { run } from "./_run";

export async function requestPaymentAction(input: unknown) {
  return run(async ({ ctx }) => {
    const id = await requestPayment(ctx, input);
    revalidatePath("/premium");
    return id;
  });
}

export async function savePremiumSettingsAction(input: unknown) {
  return run(async ({ ctx }) => {
    await savePremiumSettings(ctx, input);
    revalidatePath("/admin/premium");
    revalidatePath("/premium");
  });
}

export async function decidePaymentAction(id: string, approve: boolean) {
  return run(async ({ ctx, user }) => {
    if (!can(ctx, "payments")) throw new AppError("FORBIDDEN");
    const p = await decidePayment(id, approve, `site:${user.username ?? user.id}`);
    if (!p) throw new AppError("CONFLICT");
    revalidatePath("/admin/premium");
  });
}

export async function saveAdsAction(input: unknown) {
  return run(async ({ ctx }) => {
    await saveAds(ctx, input);
    revalidatePath("/admin/ads");
    revalidatePath("/", "layout");
  });
}

/** The Telegram Stars payment link for this account (Premium turns on by itself when paid). */
export async function starsLinkAction(months: number) {
  return run(async ({ ctx }) =>
    starsInvoiceLink(ctx, z.number().int().parse(months), (await getLocale()).slice(0, 2)),
  );
}

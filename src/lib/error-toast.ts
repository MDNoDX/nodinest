"use client";
import { toast } from "sonner";

type Failure = { code: string; details?: Record<string, unknown> };

/** A plan limit or a Premium feature: the user can lift it by going Premium. */
export function needsPremium(f: Failure | string | null | undefined): boolean {
  if (!f) return false;
  const x = typeof f === "string" ? { code: f } : f;
  return (
    x.code === "PREMIUM_REQUIRED" || (x.code === "RATE_LIMITED" && x.details?.premium === false)
  );
}

/** The message: a plan limit says so (not "too many requests"). */
export function errorText(te: (key: "INTERNAL") => string, f: Failure | string) {
  const code = typeof f === "string" ? f : f.code;
  return te((code === "RATE_LIMITED" && needsPremium(f) ? "planLimit" : code) as "INTERNAL");
}

/**
 * The translated error as a toast; for a plan limit with a "Premium" button
 * that opens the payment page.
 */
export function errorToast(te: (key: "INTERNAL") => string, f: Failure | string) {
  const msg = errorText(te, f);
  if (needsPremium(f))
    toast.error(msg, {
      duration: 9000,
      action: {
        label: te("goPremium" as "INTERNAL"),
        onClick: () => window.open("/premium", "_self"),
      },
    });
  else toast.error(msg);
}

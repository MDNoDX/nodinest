"use client";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { starsLinkAction } from "@/app/actions/premium";
import { errorToast } from "@/lib/error-toast";

/**
 * Premium for Telegram Stars: a plan opens the payment in Telegram (@nodinest_bot)
 * for this account; when it is paid, Premium is on here by itself.
 */
export function StarsPay({ plans }: { plans: { months: number; stars: number }[] }) {
  const t = useTranslations("premium");
  const te = useTranslations("errors");
  const [busy, setBusy] = useState<number | null>(null);
  const pay = async (months: number) => {
    setBusy(months);
    const r = await starsLinkAction(months).catch(() => null);
    setBusy(null);
    if (!r || !r.ok) return errorToast(te, r && !r.ok ? r : "INTERNAL");
    window.location.assign(r.data);
  };
  return (
    <section className="card flex flex-col gap-4 border-[#f5a524]/40 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Star className="size-5 fill-[#f5a524] text-[#f5a524]" /> {t("starsTitle")}
        </h2>
        <p className="text-muted mt-1 text-sm">{t("starsHint")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {plans.map((p) => (
          <button
            key={p.months}
            type="button"
            disabled={busy !== null}
            onClick={() => void pay(p.months)}
            className="border-border flex flex-col items-center gap-1 rounded-xl border p-4 transition-colors hover:border-[#f5a524] disabled:opacity-60"
          >
            <span className="text-sm font-medium">{t("monthsN", { n: p.months })}</span>
            <span className="flex items-center gap-1 text-xl font-bold">
              <Star className="size-4 fill-[#f5a524] text-[#f5a524]" /> {p.stars}
            </span>
            <span className="text-muted text-xs">
              {busy === p.months ? t("starsOpening") : t("starsPay")}
            </span>
          </button>
        ))}
      </div>
      <p className="text-muted text-xs">{t("starsAuto")}</p>
    </section>
  );
}

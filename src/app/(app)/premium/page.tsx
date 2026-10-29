import { Check, Minus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PaymentForm } from "@/components/premium/payment-form";
import { PremiumBadge } from "@/components/premium/premium-badge";
import { Badge, PageHeader } from "@/components/ui/misc";
import { asLocale, intlTag } from "@/i18n/config";
import { pageContext } from "@/lib/page";
import { getPremiumSettings, myPayments, type PlanLimits } from "@/server/premium";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: "Premium" };
}

export default async function PremiumPage() {
  const { ctx, user } = await pageContext();
  const t = await getTranslations("premium");
  const locale = asLocale(await getLocale());
  const [s, mine] = await Promise.all([getPremiumSettings(), myPayments(ctx)]);
  const date = (d: Date) => d.toLocaleDateString(intlTag(locale), { dateStyle: "long" });
  const nf = new Intl.NumberFormat(intlTag(locale));
  const hours = (m: number) =>
    m >= 60 ? t("hours", { n: Math.round((m / 60) * 10) / 10 }) : t("minutes", { n: m });
  const rows: { label: string; get: (l: PlanLimits) => React.ReactNode }[] = [
    { label: t("rowAi"), get: (l) => t("perDay", { n: l.aiDaily }) },
    { label: t("rowAudiobook"), get: (l) => yes(l.audiobook) },
    { label: t("rowCards"), get: (l) => yes(l.studyCards) },
    { label: t("rowListen"), get: (l) => `${hours(l.listenMinutes)} / ${t("day")}` },
    { label: t("rowAds"), get: (l) => (l.ads ? t("adsYes") : t("adsNo")) },
    { label: t("rowBadge"), get: (l) => yes(l === s.premium) },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader section="settings" title="Premium" subtitle={t("subtitle")} />
      <div className="flex flex-col gap-6">
        {user.isPremium && user.premiumUntil ? (
          <section className="card flex items-center gap-3 border-[#1d9bf0]/40 p-5">
            <PremiumBadge className="size-8" />
            <div>
              <p className="font-semibold">{t("active")}</p>
              <p className="text-muted text-sm">{t("until", { date: date(user.premiumUntil) })}</p>
            </div>
          </section>
        ) : null}
        <section className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-left">
                <th className="p-3 font-medium" />
                <th className="p-3 font-semibold">{t("free")}</th>
                <th className="p-3 font-semibold text-[#1d9bf0]">
                  <span className="inline-flex items-center gap-1">
                    Premium <PremiumBadge />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-border border-t">
                  <td className="text-muted p-3">{r.label}</td>
                  <td className="p-3">{r.get(s.free)}</td>
                  <td className="p-3 font-medium">{r.get(s.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-border border-t p-3 text-sm">
            <span className="text-lg font-bold">{nf.format(s.priceMonth)}</span> {t("perMonth")}
          </p>
        </section>
        <PaymentForm
          price={s.priceMonth}
          card={s.card}
          cardHolder={s.cardHolder}
          visa={s.visa}
          payme={s.payme}
          click={s.click}
          uzum={s.uzum}
          note={s.note}
        />
        {mine.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">{t("myRequests")}</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {mine.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums">{nf.format(p.amount)} söm</span>
                  <span className="text-muted">
                    · {t("monthsN", { n: p.months })} · {date(p.createdAt)}
                  </span>
                  <Badge
                    tone={
                      p.status === "approved"
                        ? "success"
                        : p.status === "rejected"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {t(`status.${p.status as "pending"}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );

  function yes(v: boolean) {
    return v ? (
      <Check className="size-4 text-[var(--c-emerald)]" aria-label="✓" />
    ) : (
      <Minus className="text-muted size-4" aria-label="—" />
    );
  }
}

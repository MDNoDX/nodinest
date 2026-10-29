"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { decidePaymentAction, savePremiumSettingsAction } from "@/app/actions/premium";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { useAction } from "@/lib/use-action";
import type { PlanLimits, PremiumSettings } from "@/server/premium";

type Payment = {
  id: string;
  amount: number;
  months: number;
  method: string;
  note: string | null;
  status: string;
  createdAt: string;
  name: string;
  username: string | null;
  premiumUntil: string | null;
};

/** Admin → Premium: price, how to pay, what each plan includes, and requests. */
export function PremiumAdmin({
  initial,
  payments,
  canEdit = true,
}: {
  initial: PremiumSettings;
  payments: Payment[];
  /** Only the superadmin changes prices and plans (an admin decides payments). */
  canEdit?: boolean;
}) {
  const t = useTranslations("premiumAdmin");
  const [v, setV] = useState(initial);
  const { pending, exec } = useAction();
  const plan = (which: "free" | "premium", patch: Partial<PlanLimits>) =>
    setV({ ...v, [which]: { ...v[which], ...patch } });
  const nf = new Intl.NumberFormat("ru-RU");

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-5">
        <h2 className="mb-3 font-semibold">{t("requests")}</h2>
        {payments.length === 0 ? (
          <p className="text-muted text-sm">{t("noRequests")}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {payments.map((p) => (
              <li
                key={p.id}
                className="border-border flex flex-wrap items-center gap-2 border-b pb-2"
              >
                <span className="font-medium">{p.name}</span>
                {p.username && <span className="text-muted">@{p.username}</span>}
                <span className="tabular-nums">
                  {nf.format(p.amount)} söm · {p.months} · {p.method}
                </span>
                {p.note && <span className="text-muted">“{p.note}”</span>}
                <span className="text-muted text-xs">{new Date(p.createdAt).toLocaleString()}</span>
                <Badge
                  tone={
                    p.status === "approved"
                      ? "success"
                      : p.status === "rejected"
                        ? "danger"
                        : "warning"
                  }
                >
                  {p.status}
                </Badge>
                {p.status === "pending" && (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" onClick={() => exec(() => decidePaymentAction(p.id, true))}>
                      ✅ {t("approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exec(() => decidePaymentAction(p.id, false))}
                    >
                      ❌ {t("reject")}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <form
          className="card flex flex-col gap-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            exec(() => savePremiumSettingsAction(v), { success: t("saved") });
          }}
        >
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={v.enabled}
              onChange={(e) => setV({ ...v, enabled: e.target.checked })}
            />
            {t("enabled")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("price")}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={v.priceMonth}
                  onChange={(e) => setV({ ...v, priceMonth: Number(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t("card")}>
              {(p) => (
                <Input
                  {...p}
                  value={v.card}
                  onChange={(e) => setV({ ...v, card: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("cardHolder")}>
              {(p) => (
                <Input
                  {...p}
                  value={v.cardHolder}
                  onChange={(e) => setV({ ...v, cardHolder: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("visa")}>
              {(p) => (
                <Input
                  {...p}
                  placeholder="4…"
                  value={v.visa}
                  onChange={(e) => setV({ ...v, visa: e.target.value })}
                />
              )}
            </Field>
            <Field label="Payme">
              {(p) => (
                <Input
                  {...p}
                  placeholder="https://payme.uz/…"
                  value={v.payme}
                  onChange={(e) => setV({ ...v, payme: e.target.value })}
                />
              )}
            </Field>
            <Field label="Click">
              {(p) => (
                <Input
                  {...p}
                  placeholder="https://my.click.uz/…"
                  value={v.click}
                  onChange={(e) => setV({ ...v, click: e.target.value })}
                />
              )}
            </Field>
            <Field label="Uzum">
              {(p) => (
                <Input
                  {...p}
                  placeholder="https://uzumbank.uz/…"
                  value={v.uzum}
                  onChange={(e) => setV({ ...v, uzum: e.target.value })}
                />
              )}
            </Field>
          </div>
          <Field label={t("note")} optional>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={v.note}
                onChange={(e) => setV({ ...v, note: e.target.value })}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["free", "premium"] as const).map((k) => (
              <fieldset key={k} className="border-border flex flex-col gap-3 rounded-xl border p-4">
                <legend className="px-1 text-sm font-semibold">{t(k)}</legend>
                <Field label={t("aiDaily")}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={0}
                      value={v[k].aiDaily}
                      onChange={(e) => plan(k, { aiDaily: Number(e.target.value) })}
                    />
                  )}
                </Field>
                <Field label={t("listenMinutes")}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={0}
                      value={v[k].listenMinutes}
                      onChange={(e) => plan(k, { listenMinutes: Number(e.target.value) })}
                    />
                  )}
                </Field>
                {(["audiobook", "studyCards", "ads"] as const).map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={v[k][f]}
                      onChange={(e) => plan(k, { [f]: e.target.checked })}
                    />
                    {t(f)}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <Button type="submit" loading={pending} className="self-start">
            {t("save")}
          </Button>
        </form>
      )}
    </div>
  );
}

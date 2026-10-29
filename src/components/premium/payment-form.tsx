"use client";
import { Copy, CreditCard, ExternalLink, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { requestPaymentAction } from "@/app/actions/premium";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";

/** How to pay (card / Payme / Click) and the "I have paid" request. */
export function PaymentForm({
  price,
  card,
  cardHolder,
  visa,
  payme,
  click,
  uzum,
  note,
}: {
  price: number;
  card: string;
  cardHolder: string;
  visa: string;
  payme: string;
  click: string;
  uzum: string;
  note: string;
}) {
  const t = useTranslations("premium");
  const { pending, exec } = useAction();
  const [months, setMonths] = useState(1);
  type Method = "card" | "visa" | "payme" | "click" | "uzum";
  const available = (
    [
      ["card", card],
      ["visa", visa],
      ["payme", payme],
      ["click", click],
      ["uzum", uzum],
    ] as const
  ).filter(([, v]) => v);
  const [method, setMethod] = useState<Method>(available[0]?.[0] ?? "card");
  const [amount, setAmount] = useState(String(price));
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const nf = new Intl.NumberFormat("ru-RU");

  if (!available.length) return <p className="card text-muted p-5 text-sm">{t("notReady")}</p>;

  return (
    <section className="card flex flex-col gap-5 p-5 sm:p-6">
      <h2 className="font-semibold">{t("howTitle")}</h2>
      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p>{t("step1", { sum: nf.format(price * months) })}</p>
            {card && <CardRow label={t("card")} number={card} holder={cardHolder} />}
            {visa && <CardRow label="Visa" number={visa} holder={cardHolder} />}
            <div className="flex flex-wrap gap-2">
              {payme && (
                <Button asChild variant="outline" size="sm">
                  <a href={payme} target="_blank" rel="noopener noreferrer">
                    Payme <ExternalLink />
                  </a>
                </Button>
              )}
              {click && (
                <Button asChild variant="outline" size="sm">
                  <a href={click} target="_blank" rel="noopener noreferrer">
                    Click <ExternalLink />
                  </a>
                </Button>
              )}
              {uzum && (
                <Button asChild variant="outline" size="sm">
                  <a href={uzum} target="_blank" rel="noopener noreferrer">
                    Uzum <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
            {note && <p className="text-muted text-xs">{note}</p>}
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <div className="min-w-0 flex-1">
            <p className="mb-3">{t("step2")}</p>
            {sent ? (
              <p className="bg-success-soft text-success rounded-xl p-3">{t("sent")}</p>
            ) : (
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  exec(
                    () =>
                      requestPaymentAction({
                        amount: Number(amount.replace(/\D/g, "")),
                        months,
                        method,
                        note: text || null,
                      }),
                    { onSuccess: () => setSent(true) },
                  );
                }}
              >
                <Field label={t("months")}>
                  {(p) => (
                    <Select
                      {...p}
                      value={months}
                      onChange={(e) => {
                        const m = Number(e.target.value);
                        setMonths(m);
                        setAmount(String(price * m));
                      }}
                    >
                      {[1, 3, 6, 12].map((m) => (
                        <option key={m} value={m}>
                          {t("monthsN", { n: m })}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t("method")}>
                  {(p) => (
                    <Select
                      {...p}
                      value={method}
                      onChange={(e) => setMethod(e.target.value as Method)}
                    >
                      {available.map(([m]) => (
                        <option key={m} value={m}>
                          {m === "card" ? t("card") : LABEL[m]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t("amount")}>
                  {(p) => (
                    <Input
                      {...p}
                      inputMode="numeric"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t("noteLabel")} optional>
                  {(p) => (
                    <Input
                      {...p}
                      maxLength={500}
                      placeholder={t("notePlaceholder")}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  )}
                </Field>
                <Button
                  type="submit"
                  loading={pending}
                  className="sm:col-span-2 sm:justify-self-start"
                >
                  <Send /> {t("submit")}
                </Button>
              </form>
            )}
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={3} />
          <p className="flex-1">{t("step3")}</p>
        </li>
      </ol>
    </section>
  );
}

const LABEL = { visa: "Visa", payme: "Payme", click: "Click", uzum: "Uzum" } as const;

/** A card number to copy (spaces dropped on copy). */
function CardRow({ label, number, holder }: { label: string; number: string; holder: string }) {
  const t = useTranslations("premium");
  return (
    <div className="bg-surface-2 flex flex-wrap items-center gap-2 rounded-xl p-3">
      <CreditCard className="text-muted size-4" />
      <span className="text-muted text-xs">{label}</span>
      <span className="font-mono text-base tracking-wider">{number}</span>
      {holder && <span className="text-muted">{holder}</span>}
      <button
        type="button"
        className="text-primary ml-auto inline-flex items-center gap-1 text-xs font-medium"
        onClick={() => {
          void navigator.clipboard?.writeText(number.replace(/\s+/g, ""));
          toast.success(t("copied"));
        }}
      >
        <Copy className="size-3.5" /> {t("copy")}
      </button>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
      {n}
    </span>
  );
}

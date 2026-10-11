"use client";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { deletePlanAction, savePlanAction, togglePlanAction } from "@/app/actions/personal";
import { mapResource } from "@/components/people/mappers";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { fmtDay } from "@/lib/format";
import { useAction } from "@/lib/use-action";

type Plan = {
  id: string;
  title: string;
  plannedOn: string | null;
  plannedMinutes: number | null;
  done: boolean;
  resourceId: string | null;
  resourceTitle: string | null;
};

export function PlanList({ plans, today }: { plans: Plan[]; today: string }) {
  const t = useTranslations();
  const locale = useLocale() as "uz" | "en";
  const { pending, exec } = useAction();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState("");
  const [resource, setResource] = useState<{ id: string; label: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_9.5rem_6rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          exec(
            () =>
              savePlanAction({
                title,
                plannedOn: date,
                plannedMinutes: minutes,
                resourceId: resource?.id ?? null,
              }),
            {
              success: t("common.saved"),
              onSuccess: () => {
                setTitle("");
                setMinutes("");
                setResource(null);
              },
            },
          );
        }}
      >
        <Field label={t("plans.planTitle")}>
          {(p) => (
            <Input {...p} required value={title} onChange={(e) => setTitle(e.target.value)} />
          )}
        </Field>
        <Field label={t("plans.plannedOn")}>
          {(p) => (
            <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          )}
        </Field>
        <Field label={t("plans.plannedMinutes")} optional>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={pending} disabled={!title.trim()}>
          {t("common.add")}
        </Button>
        <div className="sm:col-span-4">
          {resource ? (
            <div className="border-border-strong bg-surface-2 flex h-10 items-center justify-between rounded-lg border px-3 text-sm">
              <span className="truncate">{resource.label}</span>
              <button
                type="button"
                className="text-muted text-xs"
                onClick={() => setResource(null)}
              >
                {t("common.remove")}
              </button>
            </div>
          ) : (
            <Combobox
              endpoint="/api/autocomplete/resources"
              mapItem={mapResource}
              ariaLabel={t("plans.resource")}
              placeholder={`${t("plans.resource")} (${t("common.optional")})`}
              onPick={(o) => setResource({ id: o.id, label: o.label })}
            />
          )}
        </div>
      </form>
      {plans.length === 0 ? (
        <p className="text-muted text-sm">{t("plans.noPlans")}</p>
      ) : (
        <ul className="divide-border border-border bg-surface divide-y rounded-xl border">
          {plans.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={p.done}
                aria-label={`${t("plans.done")}: ${p.title}`}
                className="size-4 accent-[var(--primary)]"
                onChange={(e) => exec(() => togglePlanAction(p.id, e.target.checked))}
              />
              <div className="min-w-0 flex-1">
                <div className={p.done ? "text-muted text-sm line-through" : "text-sm font-medium"}>
                  {p.title}
                </div>
                <div className="text-muted flex flex-wrap items-center gap-1.5 text-xs">
                  {p.plannedOn && (
                    <span>
                      {fmtDay(p.plannedOn, locale, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                  {p.plannedOn && !p.done && p.plannedOn < today && (
                    <Badge tone="warning">{t("plans.overdue")}</Badge>
                  )}
                  {p.plannedMinutes && (
                    <span>
                      · {p.plannedMinutes} {t("common.minutes")}
                    </span>
                  )}
                  {p.resourceId && (
                    <Link href={`/library/${p.resourceId}`} className="truncate hover:underline">
                      · {p.resourceTitle}
                    </Link>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.delete")}
                onClick={() => exec(() => deletePlanAction(p.id))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

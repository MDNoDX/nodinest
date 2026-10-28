"use client";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { deletePlanAction, savePlanAction, togglePlanAction } from "@/app/actions/personal";
import { Cover, coverSrc } from "@/components/library/cover";
import { mapResource } from "@/components/people/mappers";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import type { FieldErrors } from "@/lib/errors";
import { fmtDay } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import type { ResourceType } from "@/lib/validation";
import { type Locale } from "@/i18n/config";

type Plan = {
  id: string;
  title: string;
  startOn: string | null;
  endOn: string | null;
  done: boolean;
  resourceId: string | null;
  resourceTitle: string | null;
  resourceType: ResourceType | null;
  coverUrl: string | null;
  coverFileId: string | null;
};

/** "Start on this day, finish on that day" — nothing more. */
export function PlanList({ plans, today }: { plans: Plan[]; today: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { pending, exec } = useAction();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [title, setTitle] = useState("");
  const [startOn, setStartOn] = useState(today);
  const [endOn, setEndOn] = useState("");
  const [resource, setResource] = useState<{ id: string; label: string } | null>(null);
  const day = (d: string) => fmtDay(d, locale, { day: "numeric", month: "short" });

  const phase = (p: Plan) => {
    if (p.done) return null;
    if (p.endOn && p.endOn < today) return { tone: "warning" as const, label: t("plans.late") };
    if (p.startOn && p.startOn > today)
      return { tone: "info" as const, label: t("plans.upcoming") };
    if (p.startOn) return { tone: "primary" as const, label: t("plans.active") };
    return null;
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 sm:grid-cols-2 sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          exec(() => savePlanAction({ title, startOn, endOn, resourceId: resource?.id ?? null }), {
            success: t("common.saved"),
            onSuccess: () => {
              setTitle("");
              setEndOn("");
              setResource(null);
            },
            onError: (r) => r.fieldErrors && setErrors(r.fieldErrors),
          });
        }}
      >
        <div className="sm:col-span-2">
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
              onPick={(o) => {
                setResource({ id: o.id, label: o.label });
                setTitle((s) => s || o.label);
              }}
            />
          )}
        </div>
        <Field label={t("plans.planTitle")} error={errors.title} className="sm:col-span-2">
          {(p) => (
            <Input {...p} required value={title} onChange={(e) => setTitle(e.target.value)} />
          )}
        </Field>
        <Field label={t("plans.from")} optional>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={startOn}
              onChange={(e) => setStartOn(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("plans.to")} optional error={errors.endOn}>
          {(p) => (
            <Input
              {...p}
              type="date"
              min={startOn || undefined}
              value={endOn}
              onChange={(e) => setEndOn(e.target.value)}
            />
          )}
        </Field>
        <Button
          type="submit"
          loading={pending}
          disabled={!title.trim()}
          className="sm:col-span-2 sm:justify-self-end"
        >
          {t("common.add")}
        </Button>
      </form>
      {plans.length === 0 ? (
        <p className="text-muted text-sm">{t("plans.noPlans")}</p>
      ) : (
        <ul className="divide-border border-border bg-surface divide-y rounded-xl border">
          {plans.map((p) => {
            const ph = phase(p);
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={p.done}
                  aria-label={`${t("plans.done")}: ${p.title}`}
                  className="size-4 shrink-0 accent-[var(--primary)]"
                  onChange={(e) => exec(() => togglePlanAction(p.id, e.target.checked))}
                />
                {p.resourceId && p.resourceType && (
                  <Link href={`/library/${p.resourceId}`} className="shrink-0">
                    <Cover
                      type={p.resourceType}
                      title={p.resourceTitle ?? p.title}
                      src={coverSrc({ coverFileId: p.coverFileId, coverUrl: p.coverUrl })}
                      size="sm"
                    />
                  </Link>
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={p.done ? "text-muted text-sm line-through" : "text-sm font-medium"}
                  >
                    {p.title}
                  </div>
                  <div className="text-muted flex flex-wrap items-center gap-1.5 text-xs">
                    {(p.startOn || p.endOn) && (
                      <span className="tabular-nums">
                        {t("plans.range", {
                          from: p.startOn ? day(p.startOn) : "…",
                          to: p.endOn ? day(p.endOn) : "…",
                        })}
                      </span>
                    )}
                    {ph && <Badge tone={ph.tone}>{ph.label}</Badge>}
                    {p.resourceId && p.resourceTitle && p.resourceTitle !== p.title && (
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
            );
          })}
        </ul>
      )}
    </div>
  );
}

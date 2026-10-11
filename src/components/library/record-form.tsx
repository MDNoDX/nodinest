"use client";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { removeRecordAction, saveRecordAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/errors";
import { useAction } from "@/lib/use-action";
import { LEARNING_STATUSES } from "@/lib/validation";

type Rec = {
  status: string;
  startedOn: string | null;
  completedOn: string | null;
  rating: number | null;
  review: string | null;
  learningGoals: string | null;
  personalNotes: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  progressUnit: string;
} | null;

export function RecordForm({
  resourceId,
  record,
  defaultTotal,
  defaultUnit,
}: {
  resourceId: string;
  record: Rec;
  defaultTotal?: number | null;
  defaultUnit?: string;
}) {
  const t = useTranslations();
  const { pending, exec } = useAction();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [v, setV] = useState({
    status: record?.status ?? "planned",
    startedOn: record?.startedOn ?? "",
    completedOn: record?.completedOn ?? "",
    rating: record?.rating ?? 0,
    review: record?.review ?? "",
    learningGoals: record?.learningGoals ?? "",
    personalNotes: record?.personalNotes ?? "",
    progressCurrent: record?.progressCurrent?.toString() ?? "",
    progressTotal: (record?.progressTotal ?? defaultTotal)?.toString() ?? "",
    progressUnit: record?.progressUnit ?? defaultUnit ?? "pages",
  });
  const set = (k: keyof typeof v, val: string | number) => setV((s) => ({ ...s, [k]: val }));

  const save = () =>
    exec(() => saveRecordAction({ resourceId, ...v, rating: v.rating || null }), {
      success: t("record.updated"),
      onError: (r) => {
        if (r.fieldErrors) setErrors(r.fieldErrors);
      },
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        save();
      }}
    >
      <Field label={t("record.status")}>
        {(p) => (
          <Select {...p} value={v.status} onChange={(e) => set("status", e.target.value)}>
            {LEARNING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-3">
        <Field label={t("record.startedOn")} optional>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={v.startedOn}
              onChange={(e) => set("startedOn", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("record.completedOn")} optional error={errors.completedOn}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={v.completedOn}
              onChange={(e) => set("completedOn", e.target.value)}
            />
          )}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("record.rating")}</legend>
        <div className="flex items-center gap-1" role="radiogroup" aria-label={t("record.rating")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={v.rating === n}
              aria-label={t("record.ratingValue", { value: n })}
              onClick={() => set("rating", v.rating === n ? 0 : n)}
              className="text-accent rounded p-0.5"
            >
              <Star className={`size-5 ${n <= v.rating ? "fill-current" : "opacity-40"}`} />
            </button>
          ))}
          <span className="text-muted ml-2 text-xs">
            {v.rating ? t("record.ratingValue", { value: v.rating }) : t("record.noRating")}
          </span>
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2 [&>*:last-child]:col-span-2">
        <Field label={t("record.current")} optional error={errors.progressCurrent}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              value={v.progressCurrent}
              onChange={(e) => set("progressCurrent", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("record.total")} optional>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={v.progressTotal}
              onChange={(e) => set("progressTotal", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("record.unit")}>
          {(p) => (
            <Select
              {...p}
              value={v.progressUnit}
              onChange={(e) => set("progressUnit", e.target.value)}
            >
              {["pages", "chapters", "minutes", "percent", "lessons"].map((u) => (
                <option key={u} value={u}>
                  {t(`progressUnits.${u}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label={t("record.goals")} optional>
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            value={v.learningGoals}
            onChange={(e) => set("learningGoals", e.target.value)}
          />
        )}
      </Field>
      <Field label={t("record.review")} optional>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            value={v.review}
            onChange={(e) => set("review", e.target.value)}
          />
        )}
      </Field>
      <Field label={t("record.personalNotes")} optional>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            value={v.personalNotes}
            onChange={(e) => set("personalNotes", e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending}>
          {t("record.save")}
        </Button>
        {record && (
          <ConfirmButton
            variant="ghost"
            message={t("record.removeConfirm")}
            onConfirm={() => exec(() => removeRecordAction(resourceId))}
          >
            {t("record.removeFromLibrary")}
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}

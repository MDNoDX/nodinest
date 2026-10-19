"use client";
import { BookCheck, BookOpen, Bookmark, PauseCircle, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { removeRecordAction, saveRecordAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ReadingDateInput, todayValue } from "@/components/ui/reading-date-input";
import { cn } from "@/lib/cn";
import type { FieldErrors } from "@/lib/errors";
import { hueStyle, type Hue } from "@/lib/hues";
import { useAction } from "@/lib/use-action";
import type { LearningStatus } from "@/lib/validation";

type Rec = {
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  rating: number | null;
  review: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  progressUnit: string;
} | null;

const STATUSES: { key: LearningStatus; icon: typeof Bookmark; hue: Hue }[] = [
  { key: "planned", icon: Bookmark, hue: "sky" },
  { key: "in_progress", icon: BookOpen, hue: "blue" },
  { key: "completed", icon: BookCheck, hue: "emerald" },
  { key: "paused", icon: PauseCircle, hue: "amber" },
];

export function RecordForm({
  resourceId,
  record,
  defaultTotal,
  defaultUnit,
  isMedia,
}: {
  resourceId: string;
  record: Rec;
  defaultTotal?: number | null;
  defaultUnit?: string;
  isMedia?: boolean;
}) {
  const t = useTranslations();
  const { pending, exec } = useAction();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [hover, setHover] = useState(0);
  const [v, setV] = useState({
    status: (record?.status === "abandoned" ? "paused" : record?.status) ?? "planned",
    startedAt: record?.startedAt ?? "",
    completedAt: record?.completedAt ?? "",
    rating: record?.rating ?? 0,
    review: record?.review ?? "",
    progressCurrent: record?.progressCurrent?.toString() ?? "",
    progressTotal: (record?.progressTotal ?? defaultTotal)?.toString() ?? "",
    progressUnit: record?.progressUnit ?? defaultUnit ?? "pages",
  });
  const set = (k: keyof typeof v, val: string | number) => setV((s) => ({ ...s, [k]: val }));
  const statusLabel = (k: string) => (isMedia ? t(`statusMedia.${k}`) : t(`status.${k}`));

  const save = () =>
    exec(
      () =>
        saveRecordAction({
          resourceId,
          status: v.status,
          startedAt: v.startedAt || null,
          completedAt: v.completedAt || null,
          rating: v.rating || null,
          review: v.review,
          progressCurrent: v.progressCurrent,
          progressTotal: v.progressTotal,
          progressUnit: v.progressUnit,
        }),
      {
        success: t("record.saved"),
        onError: (r) => {
          if (r.fieldErrors) setErrors(r.fieldErrors);
        },
      },
    );

  const shown = hover || v.rating;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        save();
      }}
    >
      <div
        role="radiogroup"
        aria-label={t("record.quickStatus")}
        className="grid grid-cols-2 gap-2"
      >
        {STATUSES.map(({ key, icon: Icon, hue }) => {
          const on = v.status === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              style={hueStyle(hue)}
              onClick={() =>
                setV((s) => ({
                  ...s,
                  status: key,
                  startedAt: key === "in_progress" && !s.startedAt ? todayValue() : s.startedAt,
                  completedAt: key === "completed" && !s.completedAt ? todayValue() : s.completedAt,
                }))
              }
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all",
                on
                  ? "chip hue-border ring-2 ring-[var(--hue)]/30"
                  : "border-border hover:bg-surface-2",
              )}
            >
              <Icon className="size-4" style={{ color: "var(--hue)" }} /> {statusLabel(key)}
            </button>
          );
        })}
      </div>

      <fieldset>
        <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-medium">
          {t("record.rating10")}
          <span className="text-muted text-xs tabular-nums">
            {v.rating ? `${v.rating}/10` : t("record.noRating")}
          </span>
        </legend>
        <div
          className="flex items-center"
          role="radiogroup"
          aria-label={t("record.rating10")}
          onMouseLeave={() => setHover(0)}
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={v.rating === n}
              aria-label={`${n}/10`}
              onMouseEnter={() => setHover(n)}
              onClick={() => set("rating", v.rating === n ? 0 : n)}
              className="rounded p-0.5 text-[var(--c-amber)]"
            >
              <Star
                className={cn(
                  "size-[22px] transition-transform",
                  n <= shown ? "fill-current" : "opacity-30",
                  hover === n && "scale-110",
                )}
              />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3">
        <Field label={t("record.startedAt")} optional error={errors.startedAt}>
          {(p) => (
            <ReadingDateInput
              id={p.id}
              value={v.startedAt}
              invalid={Boolean(errors.startedAt)}
              onChange={(x) => set("startedAt", x)}
            />
          )}
        </Field>
        <Field label={t("record.completedAt")} optional error={errors.completedAt}>
          {(p) => (
            <ReadingDateInput
              id={p.id}
              value={v.completedAt}
              invalid={Boolean(errors.completedAt)}
              onChange={(x) => set("completedAt", x)}
            />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-3 items-end gap-2">
        <Field label={t("record.current")} error={errors.progressCurrent}>
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
        <Field label={t("record.total")}>
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
        <Select
          aria-label={t("record.unit")}
          value={v.progressUnit}
          onChange={(e) => set("progressUnit", e.target.value)}
          className="min-w-0 px-2"
        >
          {["pages", "chapters", "lessons", "minutes", "percent"].map((u) => (
            <option key={u} value={u}>
              {t(`progressUnits.${u}`)}
            </option>
          ))}
        </Select>
      </div>

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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending}>
          {t("common.save")}
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

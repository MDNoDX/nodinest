"use client";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveGoalAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";
import { RESOURCE_TYPES } from "@/lib/validation";

export function GoalDialog({
  defaultOpen = false,
  label,
}: {
  defaultOpen?: boolean;
  label?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(defaultOpen);
  const { pending, exec } = useAction();
  const [v, setV] = useState({
    title: "",
    metric: "completed_resources",
    period: "year",
    target: "24",
    resourceType: "",
    note: "",
  });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={label ? "outline" : "primary"}>
          <Plus /> {label ?? t("plans.newGoal")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("plans.newGoal")} closeLabel={t("common.close")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            exec(() => saveGoalAction(v), {
              success: t("common.saved"),
              onSuccess: () => setOpen(false),
            });
          }}
        >
          <Field label={t("plans.goalTitle")}>
            {(p) => (
              <Input
                {...p}
                required
                value={v.title}
                onChange={(e) => set("title", e.target.value)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("plans.metric")}>
              {(p) => (
                <Select {...p} value={v.metric} onChange={(e) => set("metric", e.target.value)}>
                  {(["completed_resources", "pages"] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(`plans.metrics.${m}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("plans.period")}>
              {(p) => (
                <Select {...p} value={v.period} onChange={(e) => set("period", e.target.value)}>
                  {(["week", "month", "year"] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(`plans.periods.${m}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("plans.target")}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  required
                  value={v.target}
                  onChange={(e) => set("target", e.target.value)}
                />
              )}
            </Field>
            <Field label={t("plans.resourceType")}>
              {(p) => (
                <Select
                  {...p}
                  value={v.resourceType}
                  onChange={(e) => set("resourceType", e.target.value)}
                >
                  <option value="">{t("plans.anyType")}</option>
                  {RESOURCE_TYPES.map((r) => (
                    <option key={r} value={r}>
                      {t(`types.${r}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label={t("common.notes")} optional>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={v.note}
                onChange={(e) => set("note", e.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending} disabled={!v.title.trim()}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteRoutineAction, saveRoutineAction } from "@/app/actions/roznoma";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";

export type RoutineValue = {
  id?: string;
  title: string;
  amount: string | null;
  time: string | null;
  repeat: "daily" | "weekly" | "once";
  weekdays: number[];
  onDay: string | null;
  alarm: boolean;
};

/** Add or change a plan item: name, how much, time + alarm, how often. */
export function RoutineDialog({
  open,
  onOpenChange,
  initial,
  day,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: RoutineValue | null;
  /** The day a one-day item is for (when adding from a day). */
  day: string;
  onSaved?: () => void;
}) {
  const t = useTranslations("roznoma");
  const tc = useTranslations("common");
  const { pending, exec } = useAction();
  const [v, setV] = useState<RoutineValue>(
    initial ?? {
      title: "",
      amount: null,
      time: null,
      repeat: "daily",
      weekdays: [1, 2, 3, 4, 5],
      onDay: day,
      alarm: true,
    },
  );
  const days = t("weekdaysShort").split(",");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={initial?.id ? t("editItem") : t("newItem")} closeLabel={tc("close")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            exec(
              () =>
                saveRoutineAction(
                  { ...v, onDay: v.repeat === "once" ? (v.onDay ?? day) : null },
                  initial?.id,
                ),
              {
                success: t("saved"),
                onSuccess: () => {
                  onOpenChange(false);
                  onSaved?.();
                },
              },
            );
          }}
        >
          <Field label={t("itemTitle")}>
            {(p) => (
              <Input
                {...p}
                required
                autoFocus
                maxLength={160}
                placeholder={t("itemTitlePh")}
                value={v.title}
                onChange={(e) => setV({ ...v, title: e.target.value })}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("amount")} optional>
              {(p) => (
                <Input
                  {...p}
                  maxLength={60}
                  placeholder={t("amountPh")}
                  value={v.amount ?? ""}
                  onChange={(e) => setV({ ...v, amount: e.target.value || null })}
                />
              )}
            </Field>
            <Field label={t("time")} optional>
              {(p) => (
                <Input
                  {...p}
                  type="time"
                  value={v.time ?? ""}
                  onChange={(e) => setV({ ...v, time: e.target.value || null })}
                />
              )}
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("repeat")}</span>
            <div className="bg-surface-2 grid grid-cols-3 gap-0.5 rounded-lg p-0.5 text-sm">
              {(["daily", "weekly", "once"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setV({ ...v, repeat: r })}
                  className={cn(
                    "rounded-md px-2 py-1.5 font-medium",
                    v.repeat === r ? "bg-surface shadow-sm" : "text-muted",
                  )}
                >
                  {t(`repeat_${r}`)}
                </button>
              ))}
            </div>
            {v.repeat === "weekly" && (
              <div className="flex flex-wrap gap-1.5">
                {days.map((d, i) => {
                  const n = i + 1;
                  const on = v.weekdays.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        setV({
                          ...v,
                          weekdays: on ? v.weekdays.filter((x) => x !== n) : [...v.weekdays, n],
                        })
                      }
                      className={cn(
                        "size-10 rounded-full border text-xs font-semibold",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            )}
            {v.repeat === "once" && (
              <Input
                type="date"
                value={v.onDay ?? day}
                onChange={(e) => setV({ ...v, onDay: e.target.value || day })}
                aria-label={t("onDay")}
              />
            )}
          </div>
          {v.time && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={v.alarm}
                onChange={(e) => setV({ ...v, alarm: e.target.checked })}
              />
              {t("alarm")}
            </label>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" loading={pending}>
              {t("save")}
            </Button>
            {initial?.id && (
              <Button
                type="button"
                variant="ghost"
                className="text-danger ml-auto"
                onClick={() => {
                  if (!window.confirm(t("deleteConfirm"))) return;
                  exec(() => deleteRoutineAction(initial.id!), {
                    onSuccess: () => {
                      onOpenChange(false);
                      onSaved?.();
                    },
                  });
                }}
              >
                <Trash2 /> {t("delete")}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

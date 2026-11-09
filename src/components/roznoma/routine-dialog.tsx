"use client";
import { Archive, ChevronDown, Music, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { saveRoutineAction, setArchivedAction } from "@/app/actions/roznoma";
import { tell } from "@/components/ui/ask";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { ALARM_SOUNDS, UNITS, guessIcon, pickerKeys, type Unit } from "@/lib/plan-icons";
import { uploadMedia } from "@/lib/upload-media";
import { errorToast } from "@/lib/error-toast";
import { useAction } from "@/lib/use-action";
import { playAlarm } from "./alarm-sound";
import { PlanIcon, usePlanIcons } from "./plan-icon";
import { TimeField } from "./time-field";

export type RoutineValue = {
  id?: string;
  title: string;
  icon: string | null;
  note: string | null;
  amount: string | null;
  time: string | null;
  endTime: string | null;
  repeat: "daily" | "weekly" | "once";
  weekdays: number[];
  onDay: string | null;
  startsOn: string | null;
  endsOn: string | null;
  alarm: boolean;
  sound: string | null;
  inJournal: boolean;
  parentId?: string | null;
};

export const EMPTY_ROUTINE: RoutineValue = {
  title: "",
  icon: null,
  note: null,
  amount: null,
  time: null,
  endTime: null,
  repeat: "daily",
  weekdays: [1, 2, 3, 4, 5],
  onDay: null,
  startsOn: null,
  endsOn: null,
  alarm: true,
  sound: null,
  inJournal: false,
};

/** Words of items saved before the units changed. */
const OLD_UNITS: Record<string, Unit> = {
  bet: "page",
  marta: "piece",
  times: "piece",
  раз: "piece",
};
const OLD_FULL = /^(tugagun[cç]h?a|to the end|до конца)$/i;

/** Splits "20 sahifa" into its number and the unit the form offers. */
function parseAmount(a: string | null, words: Record<Unit, string>) {
  if (!a) return { n: "", unit: "none" as Unit };
  if (a === words.full || OLD_FULL.test(a.trim())) return { n: "", unit: "full" as Unit };
  const m = /^([\d.,]+)\s*(.*)$/.exec(a.trim());
  if (!m) return { n: "", unit: "none" as Unit };
  const unit = (Object.keys(words) as Unit[]).find((k) => words[k] === m[2]);
  return { n: m[1], unit: unit ?? OLD_UNITS[m[2]] ?? ("none" as Unit) };
}

/** Add or change a plan item: everything but the name is optional. */
export function RoutineDialog({
  open,
  onOpenChange,
  initial,
  day,
  userId,
  parentId,
  stored = false,
  onSaved,
  onShow,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: RoutineValue | null;
  day: string;
  userId: string;
  /** Adding an inner item under this one. */
  parentId?: string;
  /** Adding to the plans (not to today's list). */
  stored?: boolean;
  onSaved?: () => void;
  /**
   * Shows the item on the page at once (before the server answers); returns
   * how to take it back if saving fails. The window closes without waiting.
   */
  onShow?: (v: RoutineValue & { id: string; archived?: boolean }) => () => void;
}) {
  const t = useTranslations("roznoma");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const { exec } = useAction();
  const words = Object.fromEntries(UNITS.map((u) => [u, t(`unit_${u}`)])) as Record<Unit, string>;
  const [v, setV] = useState<RoutineValue>(initial ?? { ...EMPTY_ROUTINE, onDay: day });
  const parsed = parseAmount(initial?.amount ?? null, words);
  const [n, setN] = useState(parsed.n);
  const [unit, setUnit] = useState<Unit>(parsed.unit);
  const [more, setMore] = useState(!!(initial?.note || initial?.sound));
  const [iconsOpen, setIconsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const days = t("weekdaysShort").split(",");
  const inner = !!(parentId ?? initial?.parentId);
  const tn = useTranslations("planIcons");
  const icons = usePlanIcons();
  const icon = v.icon ?? guessIcon(v.title, icons);
  const nameOf = (k: string) =>
    k.startsWith("c:") ? icons.custom.find((c) => `c:${c.id}` === k)?.name : tn(k as "pin");
  const amount =
    unit === "full" ? words.full : !n ? null : unit === "none" ? n : `${n} ${words[unit]}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={initial?.id ? t("editItem") : t("newItem")} closeLabel={tc("close")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const payload = {
              ...v,
              amount,
              icon,
              onDay: v.repeat === "once" ? (v.onDay ?? day) : null,
              parentId: parentId ?? initial?.parentId ?? null,
              archived: stored,
            };
            // Shown and closed at once; the server's list replaces it when it
            // answers (revalidatePath in the action), a failure takes it back.
            const undo = onShow?.({ ...payload, id: initial?.id ?? `tmp-${Date.now()}` });
            onOpenChange(false);
            const r = await saveRoutineAction(payload, initial?.id).catch(() => null);
            if (!r?.ok) {
              undo?.();
              return errorToast(te, r && !r.ok ? r : "INTERNAL");
            }
            toast.success(t("saved"));
            onSaved?.();
          }}
        >
          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={() => setIconsOpen((o) => !o)}
              aria-expanded={iconsOpen}
              aria-label={t("chooseIcon")}
              className="bg-surface-2 hover:ring-primary/40 grid size-11 shrink-0 place-items-center rounded-xl transition hover:ring-2"
            >
              <PlanIcon name={icon} className="size-6" />
            </button>
            <div className="min-w-0 flex-1">
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
            </div>
          </div>
          {iconsOpen && (
            <div className="bg-surface-2 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto rounded-xl p-2 sm:grid-cols-10">
              {pickerKeys(icons).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={nameOf(k)}
                  title={nameOf(k)}
                  onClick={() => {
                    setV({ ...v, icon: k });
                    setIconsOpen(false);
                  }}
                  className={cn(
                    "hover:bg-surface grid aspect-square place-items-center rounded-lg transition",
                    icon === k && "bg-primary-soft ring-primary ring-2",
                  )}
                >
                  <PlanIcon name={k} className="size-5" />
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("amount")}</span>
              <div className="flex gap-2">
                {unit !== "full" && (
                  <Input
                    inputMode="decimal"
                    className="w-20"
                    value={n}
                    placeholder="20"
                    aria-label={t("amount")}
                    onChange={(e) => setN(e.target.value.replace(/[^\d.,]/g, ""))}
                  />
                )}
                <Select
                  value={unit}
                  aria-label={t("unit")}
                  onChange={(e) => setUnit(e.target.value as Unit)}
                  className="min-w-0 flex-1"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {words[u]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {!inner && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t("timeRange")}</span>
                <div className="flex items-center gap-1.5">
                  <TimeField value={v.time} onChange={(x) => setV({ ...v, time: x })} />
                  <span className="text-muted">–</span>
                  <TimeField value={v.endTime} onChange={(x) => setV({ ...v, endTime: x })} />
                </div>
              </div>
            )}
          </div>

          {!inner && (
            <div className="flex flex-col gap-2">
              <div className="bg-surface-2 grid grid-cols-3 gap-0.5 rounded-lg p-0.5 text-sm">
                {(["daily", "weekly", "once"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setV({ ...v, repeat: r })}
                    className={cn(
                      "rounded-md px-2 py-1.5 font-medium transition",
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
                    const k = i + 1;
                    const on = v.weekdays.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() =>
                          setV({
                            ...v,
                            weekdays: on ? v.weekdays.filter((x) => x !== k) : [...v.weekdays, k],
                          })
                        }
                        className={cn(
                          "size-10 rounded-full border text-xs font-semibold transition",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
              {v.repeat === "once" && (
                <DatePicker
                  value={v.onDay ?? day}
                  onChange={(d) => setV({ ...v, onDay: d || day })}
                  placeholder={t("onDay")}
                />
              )}
            </div>
          )}

          {v.time && !inner && (
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

          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            className="text-muted hover:text-foreground flex items-center gap-1 self-start text-sm font-medium"
          >
            <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
            {t("moreOptions")}
          </button>
          {more && (
            <div className="flex flex-col gap-4">
              <Field label={t("description")} optional>
                {(p) => (
                  <Input
                    {...p}
                    maxLength={500}
                    value={v.note ?? ""}
                    onChange={(e) => setV({ ...v, note: e.target.value || null })}
                  />
                )}
              </Field>
              {!inner && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t("sound")}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ALARM_SOUNDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setV({ ...v, sound: s });
                          playAlarm(s, 1);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                          (v.sound ?? "chime") === s
                            ? "border-primary text-primary"
                            : "border-border text-muted",
                        )}
                      >
                        <Play className="size-3" /> {t(`sound_${s}`)}
                      </button>
                    ))}
                    <label
                      className={cn(
                        "border-border text-muted hover:text-foreground inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium",
                        v.sound?.startsWith("file:") && "border-primary text-primary",
                      )}
                    >
                      <Music className="size-3" /> {uploading ? "…" : t("soundOwn")}
                      <input
                        type="file"
                        accept="audio/*"
                        hidden
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          if (f.size > 10 * 1024 * 1024) return void tell(t("soundTooBig"));
                          setUploading(true);
                          const up = await uploadMedia(f, { userId, name: f.name }).catch(
                            () => null,
                          );
                          setUploading(false);
                          if (up) setV((x) => ({ ...x, sound: `file:${up.fileId}` }));
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
              {!inner && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={v.inJournal}
                    onChange={(e) => setV({ ...v, inJournal: e.target.checked })}
                  />
                  {t("inJournal")}
                </label>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit">{t("save")}</Button>
            {initial?.id && (
              <Button
                type="button"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  exec(() => setArchivedAction([initial.id!], true), {
                    refresh: false,
                    success: t("archived"),
                    onSuccess: () => {
                      onOpenChange(false);
                      onSaved?.();
                    },
                  })
                }
              >
                <Archive /> {t("toArchive")}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

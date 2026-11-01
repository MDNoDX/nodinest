"use client";
import { Archive, ChevronDown, Music, Play } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { saveRoutineAction, setArchivedAction } from "@/app/actions/roznoma";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { ALARM_SOUNDS, PICKER_ICONS, UNITS, guessIcon, type Unit } from "@/lib/plan-icons";
import { uploadMedia } from "@/lib/upload-media";
import { useAction } from "@/lib/use-action";
import { playAlarm } from "./alarm-sound";
import { PlanIcon } from "./plan-icon";
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

const EMPTY: RoutineValue = {
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
  inJournal: true,
};

/** Splits "20 bet" into its number and the unit the form offers. */
function parseAmount(a: string | null, words: Record<Unit, string>) {
  if (!a) return { n: "", unit: "page" as Unit, free: "" };
  if (a === words.end) return { n: "", unit: "end" as Unit, free: "" };
  const m = /^([\d.,]+)\s*(.*)$/.exec(a.trim());
  const unit = (Object.keys(words) as Unit[]).find((k) => m && words[k] === m[2]);
  return m && unit ? { n: m[1], unit, free: "" } : { n: "", unit: "page" as Unit, free: a };
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
}) {
  const t = useTranslations("roznoma");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { pending, exec } = useAction();
  const words = Object.fromEntries(UNITS.map((u) => [u, t(`unit_${u}`)])) as Record<Unit, string>;
  const [v, setV] = useState<RoutineValue>(initial ?? { ...EMPTY, onDay: day });
  const parsed = parseAmount(initial?.amount ?? null, words);
  const [n, setN] = useState(parsed.n);
  const [unit, setUnit] = useState<Unit>(parsed.unit);
  const [more, setMore] = useState(
    !!(initial?.note || initial?.startsOn || initial?.endsOn || initial?.sound),
  );
  const [iconsOpen, setIconsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const days = t("weekdaysShort").split(",");
  const inner = !!(parentId ?? initial?.parentId);
  const icon = v.icon ?? guessIcon(v.title);
  const amount = unit === "end" ? words.end : n ? `${n} ${words[unit]}`.trim() : null;

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
                  {
                    ...v,
                    amount,
                    icon,
                    onDay: v.repeat === "once" ? (v.onDay ?? day) : null,
                    parentId: parentId ?? initial?.parentId ?? null,
                    archived: stored,
                  },
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
          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={() => setIconsOpen((o) => !o)}
              aria-expanded={iconsOpen}
              aria-label={t("chooseIcon")}
              className="bg-primary-soft text-primary hover:ring-primary/40 grid size-11 shrink-0 place-items-center rounded-xl transition hover:ring-2"
            >
              <PlanIcon name={icon} className="size-5" />
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
            <div className="bg-surface-2 grid grid-cols-5 gap-1 rounded-xl p-2 sm:grid-cols-10">
              {PICKER_ICONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={k}
                  onClick={() => {
                    setV({ ...v, icon: k });
                    setIconsOpen(false);
                  }}
                  className={cn(
                    "hover:bg-surface grid aspect-square place-items-center rounded-lg transition",
                    icon === k && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  <PlanIcon name={k} className="size-4.5" />
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("amount")}</span>
              <div className="flex gap-2">
                {unit !== "end" && (
                  <Input
                    inputMode="decimal"
                    className="w-20"
                    value={n}
                    placeholder="20"
                    aria-label={t("amount")}
                    onChange={(e) => setN(e.target.value.replace(/[^\d.,]/g, ""))}
                  />
                )}
                <select
                  value={unit}
                  aria-label={t("unit")}
                  onChange={(e) => setUnit(e.target.value as Unit)}
                  className="border-border-strong bg-surface h-10 min-w-0 flex-1 rounded-lg border px-2 text-sm"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {words[u]}
                    </option>
                  ))}
                </select>
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
                <Input
                  type="date"
                  lang={locale}
                  value={v.onDay ?? day}
                  onChange={(e) => setV({ ...v, onDay: e.target.value || day })}
                  aria-label={t("onDay")}
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
                    placeholder={t("descriptionPh")}
                    value={v.note ?? ""}
                    onChange={(e) => setV({ ...v, note: e.target.value || null })}
                  />
                )}
              </Field>
              {!inner && v.repeat !== "once" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("startsOn")} optional>
                    {(p) => (
                      <Input
                        {...p}
                        type="date"
                        value={v.startsOn ?? ""}
                        onChange={(e) => setV({ ...v, startsOn: e.target.value || null })}
                      />
                    )}
                  </Field>
                  <Field label={t("endsOn")} optional>
                    {(p) => (
                      <Input
                        {...p}
                        type="date"
                        value={v.endsOn ?? ""}
                        onChange={(e) => setV({ ...v, endsOn: e.target.value || null })}
                      />
                    )}
                  </Field>
                </div>
              )}
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
                          if (f.size > 10 * 1024 * 1024) return alert(t("soundTooBig"));
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
            <Button type="submit" loading={pending}>
              {t("save")}
            </Button>
            {initial?.id && (
              <Button
                type="button"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  exec(() => setArchivedAction([initial.id!], true), {
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

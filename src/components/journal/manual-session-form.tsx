"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveManualSessionAction } from "@/app/actions/personal";
import { mapResource } from "@/components/people/mappers";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/errors";
import { useAction } from "@/lib/use-action";

/** datetime-local value for a Date in the browser's local time. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ManualSessionForm({
  initialResource,
  session,
  onDone,
}: {
  initialResource?: { id: string; label: string } | null;
  session?: {
    id: string;
    startedAt: string;
    endedAt: string;
    minutes: number;
    note: string | null;
    resource: { id: string; label: string } | null;
  };
  onDone?: () => void;
}) {
  const t = useTranslations();
  const { pending, exec } = useAction();
  const now = new Date();
  const [resource, setResource] = useState(session?.resource ?? initialResource ?? null);
  const [startedAt, setStartedAt] = useState(
    session
      ? toLocalInput(new Date(session.startedAt))
      : toLocalInput(new Date(now.getTime() - 3600_000)),
  );
  const [endedAt, setEndedAt] = useState(
    session ? toLocalInput(new Date(session.endedAt)) : toLocalInput(now),
  );
  const [minutes, setMinutes] = useState(session ? String(session.minutes) : "");
  const [note, setNote] = useState(session?.note ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        exec(
          () =>
            saveManualSessionAction(
              {
                resourceId: resource?.id ?? null,
                startedAt: new Date(startedAt).toISOString(),
                endedAt: new Date(endedAt).toISOString(),
                durationMinutes: minutes,
                note,
              },
              session?.id,
            ),
          {
            success: t("journal.sessionSaved"),
            onSuccess: () => {
              if (!session) {
                setNote("");
                setMinutes("");
              }
              onDone?.();
            },
            onError: (r) => {
              if (r.fieldErrors) setErrors(r.fieldErrors);
              if (r.code === "VALIDATION" && r.fieldErrors) return true;
            },
          },
        );
      }}
    >
      <Field label={t("journal.resource")} optional>
        {(p) =>
          resource ? (
            <div className="border-border-strong bg-surface-2 flex h-10 items-center justify-between rounded-lg border px-3 text-sm">
              <span className="truncate">{resource.label}</span>
              <button
                type="button"
                className="text-muted hover:text-foreground text-xs"
                onClick={() => setResource(null)}
              >
                {t("common.remove")}
              </button>
            </div>
          ) : (
            <Combobox
              id={p.id}
              endpoint="/api/autocomplete/resources"
              mapItem={mapResource}
              placeholder={t("journal.noResource")}
              onPick={(o) => setResource({ id: o.id, label: o.label })}
            />
          )
        }
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("journal.startedAt")}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              required
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("journal.endedAt")} error={errors.endedAt}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              required
              value={endedAt}
              onChange={(e) => setEndedAt(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field
        label={t("journal.duration")}
        optional
        hint={t("journal.manualHint")}
        error={errors.durationMinutes}
      >
        {(p) => (
          <Input
            {...p}
            type="number"
            min={1}
            max={1440}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        )}
      </Field>
      <Field label={t("journal.finishNote")} optional>
        {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        {t("common.save")}
      </Button>
    </form>
  );
}

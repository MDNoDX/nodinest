"use client";
import { Pause, Play, Square, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  discardSessionAction,
  finishSessionAction,
  pauseSessionAction,
  resumeSessionAction,
  startSessionAction,
} from "@/app/actions/personal";
import { mapResource } from "@/components/people/mappers";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmButton } from "@/components/ui/confirm";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { formatClock, formatDuration } from "@/lib/durations";
import { useAction } from "@/lib/use-action";
import { type OpenSessionDTO, useSessionClock } from "./timer-chip";

export function TimerPanel({ session }: { session: OpenSessionDTO | null }) {
  const t = useTranslations("journal");
  const tc = useTranslations("common");
  const locale = useLocale() as "uz" | "en";
  const { pending, exec } = useAction();
  const seconds = useSessionClock(session);
  const [resource, setResource] = useState<{ id: string; label: string } | null>(null);
  const [note, setNote] = useState("");
  const [progressTo, setProgressTo] = useState("");

  if (!session) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted text-sm">{t("noActive")}</p>
        <Field label={t("resource")} optional>
          {(p) =>
            resource ? (
              <div className="border-border-strong bg-surface-2 flex h-10 items-center justify-between rounded-lg border px-3 text-sm">
                <span className="truncate">{resource.label}</span>
                <button
                  type="button"
                  className="text-muted hover:text-foreground text-xs"
                  onClick={() => setResource(null)}
                >
                  {tc("remove")}
                </button>
              </div>
            ) : (
              <Combobox
                id={p.id}
                endpoint="/api/autocomplete/resources"
                mapItem={mapResource}
                placeholder={t("noResource")}
                onPick={(o) => setResource({ id: o.id, label: o.label })}
              />
            )
          }
        </Field>
        <Button
          size="lg"
          loading={pending}
          onClick={() => exec(() => startSessionAction(resource?.id ?? null))}
        >
          <Play /> {t("start")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <div className="text-muted text-xs font-medium tracking-wide uppercase">
          {session.status === "active" ? t("active") : t("paused")}
        </div>
        <div className="mt-1 text-5xl font-semibold tabular-nums" role="timer" aria-live="off">
          {formatClock(seconds)}
        </div>
        <div className="text-muted mt-1 truncate text-sm">
          {session.resourceTitle ?? t("noResource")}
        </div>
      </div>
      <div className="flex justify-center gap-2">
        {session.status === "active" ? (
          <Button
            variant="secondary"
            loading={pending}
            onClick={() => exec(() => pauseSessionAction(session.id))}
          >
            <Pause /> {t("pause")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            loading={pending}
            onClick={() => exec(() => resumeSessionAction(session.id))}
          >
            <Play /> {t("resume")}
          </Button>
        )}
        <ConfirmButton
          variant="ghost"
          size="md"
          message={t("discardConfirm")}
          onConfirm={() => exec(() => discardSessionAction(session.id))}
        >
          <Trash2 /> {t("discard")}
        </ConfirmButton>
      </div>
      <Field label={t("finishNote")} optional>
        {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <Field label={t("progressTo")} optional>
        {(p) => (
          <Input
            {...p}
            type="number"
            min={0}
            value={progressTo}
            onChange={(e) => setProgressTo(e.target.value)}
          />
        )}
      </Field>
      <Button
        loading={pending}
        onClick={() =>
          exec(
            () =>
              finishSessionAction(session.id, {
                note: note || null,
                progressTo: progressTo ? Number(progressTo) : null,
              }),
            {
              onSuccess: (d) => {
                setNote("");
                setProgressTo("");
                import("sonner").then(({ toast }) =>
                  toast.success(
                    t("sessionFinished", { duration: formatDuration(d.activeSeconds, locale) }),
                  ),
                );
              },
            },
          )
        }
      >
        <Square /> {t("finish")}
      </Button>
      <p className="text-muted text-xs">{t("howCalculated")}</p>
    </div>
  );
}

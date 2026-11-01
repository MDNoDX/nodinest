"use client";
import { FileText, Loader2, Mic, Square, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { transcribeAudioAction } from "@/app/actions/ai";
import { fmtSeconds, useRecorder } from "@/components/media/use-recorder";
import { Button } from "@/components/ui/button";
import { errorToast } from "@/lib/error-toast";
import { uploadMedia } from "@/lib/upload-media";

export type DayRecording = { fileId: string; name: string; seconds: number; text?: boolean };

/**
 * The day told aloud. The recording itself goes into the book as sound; turning
 * it into text is a choice made afterwards, recording by recording.
 */
export function DayAudio({
  audio,
  userId,
  onChange,
  onText,
}: {
  audio: DayRecording[];
  userId: string;
  onChange: (audio: DayRecording[]) => void;
  onText: (text: string, audio: DayRecording[]) => void;
}) {
  const t = useTranslations("roznoma");
  const te = useTranslations("errors");
  const rec = useRecorder(30 * 60);
  const [saving, setSaving] = useState(false);
  const [hearing, setHearing] = useState<string | null>(null);
  // An upload or transcription ends after the list may have changed.
  const now = useRef({ audio, onChange, onText });
  useEffect(() => {
    now.current = { audio, onChange, onText };
  });
  const recording = rec.state === "recording";

  const stop = async () => {
    const r = await rec.stop();
    if (!r) return;
    setSaving(true);
    const up = await uploadMedia(r.blob, { userId, name: r.name }).catch(() => null);
    setSaving(false);
    if (!up) return errorToast(te, "INTERNAL");
    now.current.onChange([
      ...now.current.audio,
      { fileId: up.fileId, name: r.name, seconds: Math.round(r.seconds) },
    ]);
  };

  const toText = async (a: DayRecording) => {
    setHearing(a.fileId);
    const res = await transcribeAudioAction(a.fileId).catch(() => null);
    setHearing(null);
    if (!res || !res.ok) return errorToast(te, res && !res.ok ? res : "INTERNAL");
    now.current.onText(
      res.data.text,
      now.current.audio.map((x) => (x.fileId === a.fileId ? { ...x, text: true } : x)),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {audio.map((a) => (
        <div
          key={a.fileId}
          className="bg-surface-2 flex flex-wrap items-center gap-2 rounded-xl p-2"
        >
          <audio
            controls
            preload="none"
            src={`/api/files/${a.fileId}`}
            aria-label={t("speakDay")}
            className="h-9 min-w-0 flex-1 basis-52"
          />
          <span className="text-muted text-xs tabular-nums">{fmtSeconds(a.seconds)}</span>
          {!a.text && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={hearing === a.fileId}
              disabled={!!hearing}
              onClick={() => void toText(a)}
            >
              <FileText /> {t("audioToText")}
            </Button>
          )}
          <button
            type="button"
            aria-label={t("audioRemove")}
            title={t("audioRemove")}
            className="text-muted hover:text-danger p-1.5"
            onClick={() => onChange(audio.filter((x) => x.fileId !== a.fileId))}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant={recording ? "danger" : "outline"}
        disabled={saving}
        className="self-start"
        onClick={() => void (recording ? stop() : rec.start())}
      >
        {saving ? <Loader2 className="animate-spin" /> : recording ? <Square /> : <Mic />}
        {recording ? fmtSeconds(rec.seconds) : t("speakDay")}
      </Button>
    </div>
  );
}

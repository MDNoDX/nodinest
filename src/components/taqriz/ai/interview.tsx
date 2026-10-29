"use client";
import { Loader2, MessageCircleQuestion, Mic, Square, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { transcribeClipAction } from "@/app/actions/ai";
import { fmtSeconds, useRecorder } from "@/components/media/use-recorder";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";

const toB64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * "Intervyu": the AI asks one question about the author's life for the
 * chapter being written; the author answers by voice or text; the answer
 * becomes book prose (shown as a draft to insert).
 */
export function Interview({
  busy,
  ask,
  write,
}: {
  busy: boolean;
  ask: () => Promise<string | null>;
  write: (question: string, answer: string) => void;
}) {
  const t = useTranslations("taqrizAi");
  const te = useTranslations("errors");
  const rec = useRecorder(4 * 60);
  const [question, setQuestion] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [hearing, setHearing] = useState(false);

  const next = async () => {
    setAsking(true);
    const q = await ask();
    setAsking(false);
    if (q) {
      setQuestion(q);
      setAnswer("");
    }
  };
  const stop = async () => {
    const r = await rec.stop();
    if (!r) return;
    setHearing(true);
    const res = await transcribeClipAction({ mime: r.mime, data: await toB64(r.blob) }).catch(
      () => null,
    );
    setHearing(false);
    if (!res || !res.ok) return errorToast(te, res && !res.ok ? res : "INTERNAL");
    setAnswer((a) => (a ? `${a}\n\n${res.data.text}` : res.data.text));
  };
  const recording = rec.state === "recording";

  return (
    <section className="border-primary/30 bg-primary-soft/40 flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="text-primary size-4" />
        <span className="text-sm font-semibold">{t("interview")}</span>
      </div>
      {!question ? (
        <>
          <p className="text-muted text-xs">{t("interviewHint")}</p>
          <Button
            size="sm"
            disabled={asking || busy}
            onClick={() => void next()}
            className="self-start"
          >
            {asking ? <Loader2 className="animate-spin" /> : <MessageCircleQuestion />}
            {t("interviewStart")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-foreground text-sm leading-relaxed font-medium">{question}</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder={t("interviewAnswer")}
            className="border-border-strong bg-surface rounded-lg border px-2.5 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={recording ? "danger" : "secondary"}
              disabled={hearing}
              onClick={() => (recording ? void stop() : void rec.start())}
            >
              {recording ? <Square /> : <Mic />}
              {recording ? `${t("stopRecording")} ${fmtSeconds(rec.seconds)}` : t("speak")}
            </Button>
            {hearing && (
              <span className="text-muted flex items-center gap-1 text-xs">
                <Loader2 className="size-3.5 animate-spin" /> {t("hearing")}
              </span>
            )}
            <Button
              size="sm"
              disabled={!answer.trim() || busy}
              onClick={() => write(question, answer.trim())}
              className={cn("ml-auto")}
            >
              <Wand2 /> {t("interviewWrite")}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => void next()}
            disabled={asking || busy}
            className="text-primary self-start text-xs font-medium hover:underline disabled:opacity-50"
          >
            {asking ? t("thinking") : t("interviewNext")}
          </button>
        </>
      )}
    </section>
  );
}

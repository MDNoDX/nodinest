"use client";
import { Loader2, Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { transcribeClipAction } from "@/app/actions/ai";
import { fmtSeconds, useRecorder } from "@/components/media/use-recorder";
import { Button } from "@/components/ui/button";
import { errorToast } from "@/lib/error-toast";

const toB64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Tell it aloud: the recording becomes text in the field. */
export function Dictate({ onText }: { onText: (text: string) => void }) {
  const t = useTranslations("roznoma");
  const te = useTranslations("errors");
  const rec = useRecorder(10 * 60);
  const [hearing, setHearing] = useState(false);
  const recording = rec.state === "recording";
  const stop = async () => {
    const r = await rec.stop();
    if (!r) return;
    setHearing(true);
    const res = await transcribeClipAction({ mime: r.mime, data: await toB64(r.blob) }).catch(
      () => null,
    );
    setHearing(false);
    if (!res || !res.ok) return errorToast(te, res && !res.ok ? res : "INTERNAL");
    onText(res.data.text);
  };
  return (
    <Button
      type="button"
      size="sm"
      variant={recording ? "danger" : "outline"}
      disabled={hearing}
      className="self-start"
      onClick={() => void (recording ? stop() : rec.start())}
    >
      {hearing ? <Loader2 className="animate-spin" /> : recording ? <Square /> : <Mic />}
      {recording ? fmtSeconds(rec.seconds) : t("speakDay")}
    </Button>
  );
}

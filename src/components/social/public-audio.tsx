"use client";
import { SkipBack, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Listening to a shared audiobook: the parts its owner has already had voiced. */
export function PublicAudio({ base, parts }: { base: string; parts: number }) {
  const t = useTranslations("audiobook");
  const ts = useTranslations("social");
  const [idx, setIdx] = useState(0);
  const [missing, setMissing] = useState(false);
  const go = (i: number) => {
    setMissing(false);
    setIdx(Math.max(0, Math.min(parts - 1, i)));
  };
  return (
    <div className="flex flex-col gap-2">
      <audio
        key={idx}
        controls
        preload="none"
        src={`${base}/${idx}`}
        onError={() => setMissing(true)}
        onEnded={() => go(idx + 1)}
        className="w-full"
      />
      <div className="flex items-center justify-between gap-2 text-sm">
        <button type="button" aria-label={t("prev")} onClick={() => go(idx - 1)} className="p-1.5">
          <SkipBack className="size-4 fill-current" />
        </button>
        <span className="text-muted tabular-nums">{t("part", { n: idx + 1, total: parts })}</span>
        <button type="button" aria-label={t("next")} onClick={() => go(idx + 1)} className="p-1.5">
          <SkipForward className="size-4 fill-current" />
        </button>
      </div>
      {missing && <p className="text-muted text-xs">{ts("partNotReady")}</p>}
    </div>
  );
}

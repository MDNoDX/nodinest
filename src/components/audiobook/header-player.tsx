"use client";
/* eslint-disable @next/next/no-img-element */
import { Headphones, Loader2, Pause, Play, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAudiobook } from "./engine";
import { SeekIcon } from "./seek-icon";

/**
 * The book that is playing, in the top bar: it stays there on every page, so
 * the listener can go anywhere and keep control.
 */
export function HeaderPlayer({ className }: { className?: string }) {
  const t = useTranslations("audiobook");
  const e = useAudiobook();
  if (!e?.src) return null;
  const { src, playing, loading, time, toggle, seek, close, speed, speeds, setSpeed } = e;
  const pct = time.dur ? (time.cur / time.dur) * 100 : 0;
  const btn =
    "text-muted hover:text-foreground rounded-full px-1.5 py-1 text-[11px] font-semibold tabular-nums transition-colors";
  return (
    <div
      className={`border-border bg-surface relative flex min-w-0 items-center gap-1 overflow-hidden rounded-full border py-1 pr-1 pl-1.5 ${className ?? ""}`}
    >
      <Link
        href={`/library/${src.id}/audiobook`}
        className="flex min-w-0 flex-1 items-center gap-2"
        title={src.title}
      >
        {src.cover ? (
          <img src={src.cover} alt="" className="size-7 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="bg-primary-soft text-primary grid size-7 shrink-0 place-items-center rounded-full">
            <Headphones className="size-3.5" />
          </span>
        )}
        <span className="truncate text-xs font-semibold">{src.title}</span>
      </Link>
      <button
        type="button"
        onClick={() => setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length])}
        aria-label={t("speed")}
        title={t("speed")}
        className={`${btn} text-foreground`}
      >
        {speed}×
      </button>
      <button
        type="button"
        onClick={() => seek(-10)}
        aria-label={t("back15")}
        title={t("back15")}
        className={btn}
      >
        <SeekIcon dir={-1} className="size-5" />
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t("pause") : t("play")}
        className="btn-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full"
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : playing ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5 translate-x-px" />
        )}
      </button>
      <button
        type="button"
        onClick={() => seek(10)}
        aria-label={t("fwd15")}
        title={t("fwd15")}
        className={btn}
      >
        <SeekIcon dir={1} className="size-5" />
      </button>
      <button type="button" onClick={close} aria-label={t("closePlayer")} className={btn}>
        <X className="size-3.5" />
      </button>
      <span
        aria-hidden
        className="bg-primary absolute bottom-0 left-0 h-0.5 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

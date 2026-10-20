"use client";
import { AudioLines, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { fmtClock, useMediaDock, type DockSource } from "./media-dock";

/**
 * Poster on the resource page that starts the video / audio in the app-wide
 * player, so it keeps playing while the user writes the taqriz or notes.
 */
export function PlayInDock({
  source,
  className,
  at,
}: {
  source: DockSource;
  className?: string;
  /** Saved second to continue from. */
  at?: number | null;
}) {
  const t = useTranslations("dock");
  const dock = useMediaDock();
  const active = dock?.source && dock.keyOf(dock.source) === dock.keyOf(source);
  const thumb =
    source.kind === "youtube"
      ? `https://i.ytimg.com/vi/${encodeURIComponent(source.id)}/hqdefault.jpg`
      : null;
  return (
    <button
      type="button"
      onClick={() => (active ? dock.toggle() : dock?.open(source, { at: at ?? 0 }))}
      className={cn(
        "group border-border relative block w-full overflow-hidden rounded-2xl border bg-black text-left",
        thumb || (source.kind === "file" && source.video) ? "aspect-video" : "h-28",
        className,
      )}
    >
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-80 transition-opacity group-hover:opacity-60"
        />
      )}
      {!thumb && (
        <AudioLines className="absolute inset-0 m-auto size-16 text-white/20" aria-hidden />
      )}
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
        <span className="grid size-16 place-items-center rounded-full bg-black/60 ring-1 ring-white/30 backdrop-blur transition-transform group-hover:scale-105">
          {active && dock.playing ? (
            <Pause className="size-7" />
          ) : (
            <Play className="size-7 translate-x-0.5" />
          )}
        </span>
        <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium backdrop-blur">
          {active
            ? t("playingBelow")
            : at && at > 5
              ? t("continueFrom", { time: fmtClock(at) })
              : t("listenAndWrite")}
        </span>
      </span>
    </button>
  );
}

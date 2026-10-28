"use client";
import { cn } from "@/lib/cn";
import type { DockSource } from "./media-dock";

export type DockState = {
  source: DockSource | null;
  playing: boolean;
  time: number;
  duration: number;
  rate: number;
};

type MacBridge = { postMessage: (m: unknown) => void };
/** The NodiNest Mac app's native bridge (absent in browsers). */
export const macBridge = (): MacBridge | null =>
  (typeof window !== "undefined" &&
    (window as unknown as { webkit?: { messageHandlers?: { nodinest?: MacBridge } } }).webkit
      ?.messageHandlers?.nodinest) ||
  null;
/** System media key via the Mac app, or null (then the key is left alone). */
export const macMedia = (action: "playpause") => {
  const b = macBridge();
  return b ? () => b.postMessage({ type: "media", action }) : null;
};

/** <audio>/<video> events → dock state (`at` = start position once loaded). */
export function mediaHandlers(setSt: React.Dispatch<React.SetStateAction<DockState>>, at: number) {
  const sync = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const m = e.currentTarget;
    setSt((s) => ({
      ...s,
      time: m.currentTime,
      duration: Number.isFinite(m.duration) ? m.duration : s.duration,
      playing: !m.paused,
      rate: m.playbackRate,
    }));
  };
  return {
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      if (at) e.currentTarget.currentTime = at;
      sync(e);
    },
    onTimeUpdate: sync,
    onPlay: sync,
    onPause: sync,
    onRateChange: sync,
    onDurationChange: sync,
  };
}

export function Chip({
  onClick,
  icon,
  pressed,
  title,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  pressed?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={pressed}
      className={cn(
        "border-border hover:bg-surface-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        pressed ? "text-foreground" : "text-muted",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-muted hover:text-foreground hover:bg-surface-2 grid size-8 shrink-0 place-items-center rounded-md"
    >
      {children}
    </button>
  );
}

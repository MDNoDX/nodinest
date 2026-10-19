"use client";
import {
  GripHorizontal,
  Headphones,
  Keyboard,
  Video,
  Clock,
  FilePenLine,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { setDockPrefs, useAltLabel, useDockPrefs } from "./dock-prefs";

/**
 * A player that lives in the app shell, so a YouTube video or an audio /
 * video file keeps playing while the user moves to the taqriz, notes or
 * anywhere else. Keyboard (works while typing; Alt = ⌥ Option on a Mac): Alt+K play/pause,
 * Alt+J / Alt+L −5 s / +5 s, Alt+T insert a time stamp into the taqriz.
 * Resuming after a pause rewinds 2 s so no word is lost.
 */
export type DockSource =
  | { kind: "youtube"; id: string; title: string; resourceId: string }
  | { kind: "file"; src: string; video: boolean; title: string; resourceId: string };

type DockState = {
  source: DockSource | null;
  playing: boolean;
  time: number;
  duration: number;
  rate: number;
};

type DockApi = DockState & {
  open: (s: DockSource, opts?: { at?: number; autoplay?: boolean }) => void;
  toggle: () => void;
  seekBy: (d: number) => void;
  seekTo: (t: number) => void;
  close: () => void;
  keyOf: (s: DockSource) => string;
};

const Ctx = createContext<DockApi | null>(null);
export const useMediaDock = () => useContext(Ctx);

const YT_ORIGIN = "https://www.youtube-nocookie.com";
const STORE = "nn:dock";
const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];
const keyOf = (s: DockSource) => (s.kind === "youtube" ? `yt:${s.id}` : `f:${s.src}`);

export function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Event the taqriz editor listens to; `handled` is set when it inserted the stamp. */
export type StampEvent = CustomEvent<{ label: string; seconds: number; handled: boolean }>;

export function MediaDockProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("dock");
  const [st, setSt] = useState<DockState>({
    source: null,
    playing: false,
    time: 0,
    duration: 0,
    rate: 1,
  });
  const [start, setStart] = useState({ at: 0, autoplay: true, n: 0 });
  const prefs = useDockPrefs();
  const mini = prefs.audioOnly;
  const box = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const media = useRef<HTMLMediaElement>(null);
  const live = useRef(st);
  useEffect(() => {
    live.current = st;
  }, [st]);

  // ── YouTube: commands and state over postMessage (no external script) ──
  const yt = useCallback((func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" }),
      YT_ORIGIN,
    );
  }, []);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== frame.current?.contentWindow) return;
      let data: { event?: string; info?: Record<string, number> } | null = null;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      const info = data?.info;
      if (!info || typeof info !== "object") return;
      setSt((s) => ({
        ...s,
        time: typeof info.currentTime === "number" ? info.currentTime : s.time,
        duration:
          typeof info.duration === "number" && info.duration > 0 ? info.duration : s.duration,
        rate: typeof info.playbackRate === "number" ? info.playbackRate : s.rate,
        playing:
          typeof info.playerState === "number"
            ? info.playerState === 1 || info.playerState === 3
            : s.playing,
      }));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const ytListen = () =>
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
      YT_ORIGIN,
    );

  const isYt = st.source?.kind === "youtube";
  const play = useCallback(() => {
    if (live.current.source?.kind === "youtube") yt("playVideo");
    else void media.current?.play().catch(() => {});
  }, [yt]);
  const pause = useCallback(() => {
    if (live.current.source?.kind === "youtube") yt("pauseVideo");
    else media.current?.pause();
  }, [yt]);
  const seekTo = useCallback(
    (sec: number) => {
      const d = live.current.duration;
      const to = Math.max(0, d ? Math.min(sec, d - 0.5) : sec);
      if (live.current.source?.kind === "youtube") yt("seekTo", [to, true]);
      else if (media.current) media.current.currentTime = to;
      setSt((s) => ({ ...s, time: to }));
    },
    [yt],
  );
  const seekBy = useCallback((d: number) => seekTo(live.current.time + d), [seekTo]);
  const toggle = useCallback(() => {
    if (live.current.playing) pause();
    else {
      if (live.current.time > 3) seekTo(live.current.time - 2);
      play();
    }
  }, [pause, play, seekTo]);
  const setRate = (r: number) => {
    if (isYt) yt("setPlaybackRate", [r]);
    else if (media.current) media.current.playbackRate = r;
    setSt((s) => ({ ...s, rate: r }));
  };

  const open = useCallback(
    (source: DockSource, opts?: { at?: number; autoplay?: boolean }) => {
      const same = live.current.source && keyOf(live.current.source) === keyOf(source);
      if (same) {
        if (!live.current.playing) {
          if (live.current.source?.kind === "youtube") yt("playVideo");
          else void media.current?.play().catch(() => {});
        }
        return;
      }
      setSt({ source, playing: false, time: opts?.at ?? 0, duration: 0, rate: 1 });
      setStart((p) => ({
        at: Math.floor(opts?.at ?? 0),
        autoplay: opts?.autoplay ?? true,
        n: p.n + 1,
      }));
    },
    [yt],
  );
  const close = useCallback(() => {
    setSt({ source: null, playing: false, time: 0, duration: 0, rate: 1 });
    try {
      sessionStorage.removeItem(STORE);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Survive a full reload of the tab (restored paused at the same second).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (!raw) return;
      const saved = JSON.parse(raw) as { source: DockSource; time: number };
      if (saved?.source) open(saved.source, { at: saved.time, autoplay: false });
    } catch {
      /* ignore */
    }
  }, [open]);
  const savedAt = useRef(0);
  useEffect(() => {
    if (!st.source) return;
    if (Math.abs(st.time - savedAt.current) < 5 && st.time !== 0) return;
    savedAt.current = st.time;
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ source: st.source, time: st.time }));
    } catch {
      /* storage unavailable */
    }
  }, [st.source, st.time]);

  const stamp = useCallback(() => {
    const seconds = Math.floor(live.current.time);
    const label = fmtClock(seconds);
    const ev = new CustomEvent("nn:media-stamp", {
      detail: { label, seconds, handled: false },
    }) as StampEvent;
    window.dispatchEvent(ev);
    if (!ev.detail.handled) {
      void navigator.clipboard?.writeText(`[${label}]`).catch(() => {});
      toast(t("stampCopied", { label }));
    }
  }, [t]);

  // Shortcuts work everywhere, also inside the editor (Alt + physical key).
  useEffect(() => {
    if (!st.source) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const act = { KeyK: toggle, KeyJ: () => seekBy(-5), KeyL: () => seekBy(5), KeyT: stamp }[
        e.code
      ];
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      act();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [st.source, toggle, seekBy, stamp]);

  const api = useMemo<DockApi>(
    () => ({ ...st, open, toggle, seekBy, seekTo, close, keyOf }),
    [st, open, toggle, seekBy, seekTo, close],
  );

  const s = st.source;
  const mod = useAltLabel();

  // Drag the dock anywhere by its grip; the spot is remembered on this device.
  const clamp = (x: number, y: number, w = 380, h = 140) => ({
    x: Math.round(Math.max(8, Math.min(x, window.innerWidth - w - 8))),
    y: Math.round(Math.max(64, Math.min(y, window.innerHeight - h - 8))),
  });
  const startDrag = (e: React.PointerEvent) => {
    const el = box.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    let last = { x: r.left, y: r.top };
    setDragging(true);
    const move = (ev: PointerEvent) => {
      last = clamp(ev.clientX - dx, ev.clientY - dy, r.width, r.height);
      el.style.left = `${last.x}px`;
      el.style.top = `${last.y}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDragging(false);
      setDockPrefs({ pos: last });
      el.style.right = "";
      el.style.bottom = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  // Keep a remembered spot on screen after the window shrinks.
  const [, bump] = useState(0);
  useEffect(() => {
    const onResize = () => bump((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const pos =
    prefs.pos && typeof window !== "undefined"
      ? clamp(prefs.pos.x, prefs.pos.y, Math.min(380, window.innerWidth - 24))
      : null;
  const video = s && (s.kind === "youtube" || s.video);
  const ytSrc =
    s?.kind === "youtube"
      ? `${YT_ORIGIN}/embed/${encodeURIComponent(s.id)}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1` +
        `&autoplay=${start.autoplay ? 1 : 0}&start=${start.at}` +
        (typeof window !== "undefined"
          ? `&origin=${encodeURIComponent(window.location.origin)}`
          : "")
      : "";

  return (
    <Ctx.Provider value={api}>
      {children}
      {s && (
        <aside
          ref={box}
          aria-label={t("label")}
          style={pos ? { left: pos.x, top: pos.y } : undefined}
          className={cn(
            "border-border bg-surface fixed z-40 w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border shadow-xl",
            !pos && "right-3 bottom-3 sm:right-5 sm:bottom-5",
            dragging && "shadow-2xl select-none",
          )}
        >
          <div
            onPointerDown={startDrag}
            onDoubleClick={() => setDockPrefs({ pos: null })}
            title={t("drag")}
            aria-hidden
            className={cn(
              "bg-surface-2/70 text-muted flex h-5 touch-none items-center justify-center",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
          >
            <GripHorizontal className="size-4" />
          </div>
          {/* The element stays mounted when minimised, so playback never stops. */}
          <div className={cn("relative bg-black", video ? (mini ? "h-0" : "aspect-video") : "h-0")}>
            {s.kind === "youtube" ? (
              <iframe
                key={`${keyOf(s)}#${start.n}`}
                ref={frame}
                src={ytSrc}
                title={s.title}
                onLoad={ytListen}
                className={cn("absolute inset-0 size-full", dragging && "pointer-events-none")}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : s.video ? (
              <video
                key={`${keyOf(s)}#${start.n}`}
                ref={media as React.RefObject<HTMLVideoElement>}
                src={s.src}
                playsInline
                autoPlay={start.autoplay}
                className="absolute inset-0 size-full"
                {...mediaHandlers(setSt, start.at)}
              />
            ) : (
              <audio
                key={`${keyOf(s)}#${start.n}`}
                ref={media as React.RefObject<HTMLAudioElement>}
                src={s.src}
                autoPlay={start.autoplay}
                {...mediaHandlers(setSt, start.at)}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5 px-3 pt-2 pb-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={`/library/${s.resourceId}`}
                className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
                title={s.title}
              >
                {s.title}
              </Link>
              <Link
                href={`/library/${s.resourceId}/taqriz`}
                className="text-muted hover:text-foreground shrink-0 rounded-md p-1"
                title={t("writeTaqriz")}
                aria-label={t("writeTaqriz")}
              >
                <FilePenLine className="size-4" />
              </Link>
              <button
                type="button"
                onClick={close}
                className="text-muted hover:text-foreground shrink-0 rounded-md p-1"
                aria-label={t("close")}
                title={t("close")}
              >
                <X className="size-4" />
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(st.duration))}
              step={1}
              value={Math.min(Math.floor(st.time), Math.max(1, Math.floor(st.duration)))}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label={t("position")}
              className="h-1 w-full accent-[var(--primary)]"
              disabled={!st.duration}
            />
            <div className="flex items-center gap-1">
              <IconBtn label={`${t("back5")} ({mod}J)`} onClick={() => seekBy(-5)}>
                <RotateCcw className="size-4" />
              </IconBtn>
              <button
                type="button"
                onClick={toggle}
                aria-label={`${st.playing ? t("pause") : t("play")} ({mod}K)`}
                title={`${st.playing ? t("pause") : t("play")} ({mod}K)`}
                className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full"
              >
                {st.playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4 translate-x-px" />
                )}
              </button>
              <IconBtn label={`${t("fwd5")} ({mod}L)`} onClick={() => seekBy(5)}>
                <RotateCw className="size-4" />
              </IconBtn>
              <span className="text-muted ml-1 text-xs tabular-nums">
                {fmtClock(st.time)}
                {st.duration ? ` / ${fmtClock(st.duration)}` : ""}
              </span>
              <button
                type="button"
                onClick={() => setRate(RATES[(RATES.indexOf(st.rate) + 1) % RATES.length] ?? 1)}
                className="text-muted hover:text-foreground hover:bg-surface-2 ml-auto rounded-md px-1.5 py-1 text-xs font-semibold tabular-nums"
                aria-label={t("speed")}
                title={t("speed")}
              >
                {st.rate}×
              </button>
              <IconBtn label={`${t("stamp")} ({mod}T)`} onClick={stamp}>
                <Clock className="size-4" />
              </IconBtn>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {video && (
                <Chip
                  onClick={() => setDockPrefs({ audioOnly: !mini })}
                  icon={mini ? <Video className="size-3.5" /> : <Headphones className="size-3.5" />}
                >
                  {mini ? t("showVideo") : t("audioOnly")}
                </Chip>
              )}
              <Chip
                onClick={() => setDockPrefs({ showKeys: !prefs.showKeys })}
                icon={<Keyboard className="size-3.5" />}
                pressed={prefs.showKeys}
              >
                {t("keysToggle")}
              </Chip>
            </div>
            {prefs.showKeys && (
              <p className="text-muted text-[11px] leading-tight">
                {t("keys", { k: `${mod}K`, j: `${mod}J`, l: `${mod}L`, t: `${mod}T` })}
              </p>
            )}
          </div>
        </aside>
      )}
    </Ctx.Provider>
  );
}

function mediaHandlers(setSt: React.Dispatch<React.SetStateAction<DockState>>, at: number) {
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

function Chip({
  onClick,
  icon,
  pressed,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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

function IconBtn({
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

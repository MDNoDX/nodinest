"use client";
import {
  ChevronDown,
  ChevronUp,
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

/**
 * A player that lives in the app shell, so a YouTube video or an audio /
 * video file keeps playing while the user moves to the taqriz, notes or
 * anywhere else. Keyboard (works while typing): Alt+K play/pause,
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
  const [mini, setMini] = useState(false);
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
        setMini(false);
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
      setMini(false);
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
          aria-label={t("label")}
          className="border-border bg-surface fixed right-3 bottom-3 z-40 w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border shadow-xl sm:right-5 sm:bottom-5"
        >
          {/* The element stays mounted when minimised, so playback never stops. */}
          <div className={cn("relative bg-black", video ? (mini ? "h-0" : "aspect-video") : "h-0")}>
            {s.kind === "youtube" ? (
              <iframe
                key={`${keyOf(s)}#${start.n}`}
                ref={frame}
                src={ytSrc}
                title={s.title}
                onLoad={ytListen}
                className="absolute inset-0 size-full"
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
              {video && (
                <button
                  type="button"
                  onClick={() => setMini((m) => !m)}
                  className="text-muted hover:text-foreground shrink-0 rounded-md p-1"
                  aria-label={mini ? t("expand") : t("minimise")}
                  title={mini ? t("expand") : t("minimise")}
                >
                  {mini ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
              )}
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
              <IconBtn label={`${t("back5")} (Alt+J)`} onClick={() => seekBy(-5)}>
                <RotateCcw className="size-4" />
              </IconBtn>
              <button
                type="button"
                onClick={toggle}
                aria-label={`${st.playing ? t("pause") : t("play")} (Alt+K)`}
                title={`${st.playing ? t("pause") : t("play")} (Alt+K)`}
                className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full"
              >
                {st.playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4 translate-x-px" />
                )}
              </button>
              <IconBtn label={`${t("fwd5")} (Alt+L)`} onClick={() => seekBy(5)}>
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
              <IconBtn label={`${t("stamp")} (Alt+T)`} onClick={stamp}>
                <Clock className="size-4" />
              </IconBtn>
            </div>
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

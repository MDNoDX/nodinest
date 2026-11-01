"use client";
import { Headphones, Loader2, Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { errorToast } from "@/lib/error-toast";
import { getShortcuts, matches } from "@/lib/shortcuts";

export type ScriptLine = { speaker: string; text: string };

/** What the player needs to know about the book that is playing. */
export type AudiobookSource = {
  id: string;
  title: string;
  authors: string;
  cover: string | null;
  /** Changes with the analysis / the voice: another URL, another recording. */
  version: string;
  segments: number;
  /** Segment index where each chapter starts. */
  chapterAt: number[];
  chapters: string[];
  startIdx: number;
  startSec: number;
};

type Seg = { blob: Blob; marks: number[] };
const CACHE = "nn-audiobook";

const marksOf = (r: Response) =>
  (r.headers.get("x-nn-marks") ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);

/** One part's MP3 + when each line starts (kept in the browser, so it never comes twice). */
async function segmentBlob(url: string): Promise<Seg> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return { marks: marksOf(hit), blob: await hit.blob() };
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string; premium?: boolean };
    throw Object.assign(new Error(d.error ?? "INTERNAL"), { premium: d.premium });
  }
  if (cache) await cache.put(url, res.clone()).catch(() => {});
  return { marks: marksOf(res), blob: await res.blob() };
}

const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const SPEED_KEY = "nn:abook-speed";
const readSpeed = () => {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(v) ? v : 1;
  } catch {
    return 1;
  }
};

type Engine = {
  src: AudiobookSource | null;
  idx: number;
  playing: boolean;
  loading: boolean;
  time: { cur: number; dur: number };
  lines: ScriptLine[] | null;
  marks: number[];
  speed: number;
  speeds: number[];
  /** Stop at a moment (ms) or at the end of the chapter. */
  sleep: number | "chapter" | null;
  setSleep: (v: number | "chapter" | null) => void;
  setSpeed: (v: number) => void;
  /** Shows a book in the player (keeps playing if it is the one already on). */
  open: (s: AudiobookSource) => void;
  go: (i: number, play?: boolean) => void;
  toggle: () => void;
  seek: (d: number) => void;
  seekTo: (t: number) => void;
  close: () => void;
};

const Ctx = createContext<Engine | null>(null);
export const useAudiobook = () => useContext(Ctx);

/**
 * The audiobook lives above the pages: it plays on while the user moves around
 * the site, with the screen off and from the headphones' buttons; the bar at
 * the bottom shows it when its own page is closed.
 */
export function AudiobookProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("audiobook");
  const te = useTranslations("errors");
  const pathname = usePathname();
  const audio = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<AudiobookSource | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const [lines, setLines] = useState<ScriptLine[] | null>(null);
  const [marks, setMarks] = useState<number[]>([]);
  const [speed, setSpeedState] = useState(1);
  const [sleep, setSleep] = useState<number | "chapter" | null>(null);
  const live = useRef({ src, idx, playing, sleep, speed });
  useEffect(() => {
    live.current = { src, idx, playing, sleep, speed };
  });
  const urls = useRef(new Map<string, string>());
  const inflight = useRef(new Map<string, Promise<Seg>>());
  const want = useRef(false);
  const startAt = useRef(0);

  useEffect(() => {
    queueMicrotask(() => setSpeedState(readSpeed()));
  }, []);
  const setSpeed = useCallback((v: number) => {
    setSpeedState(v);
    if (audio.current) audio.current.playbackRate = v;
    try {
      localStorage.setItem(SPEED_KEY, String(v));
    } catch {
      /* ignore */
    }
  }, []);

  const urlOf = useCallback(
    (s: AudiobookSource, i: number) => `/api/audiobook/${s.id}/segment/${i}?v=${s.version}`,
    [],
  );
  const blobFor = useCallback(
    (s: AudiobookSource, i: number) => {
      const url = urlOf(s, i);
      let p = inflight.current.get(url);
      if (!p) {
        p = segmentBlob(url);
        inflight.current.set(url, p);
        p.catch(() => inflight.current.delete(url));
      }
      return p;
    },
    [urlOf],
  );
  const text = useCallback((s: AudiobookSource, i: number) => {
    void fetch(`/api/audiobook/${s.id}/script/${i}?fast=1&plain=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { lines: ScriptLine[] } | null) => {
        if (d && live.current.idx === i) setLines(d.lines);
      })
      .catch(() => {});
  }, []);

  const savePos = useCallback(() => {
    const s = live.current.src;
    if (!s) return;
    void fetch(`/api/audiobook/${s.id}/position`, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idx: live.current.idx,
        sec: Math.floor(audio.current?.currentTime ?? 0),
      }),
    }).catch(() => {});
  }, []);

  /** Puts part i in the player; the voice is made only when it is really asked for. */
  const load = useCallback(
    async (s: AudiobookSource, i: number, play: boolean) => {
      const a = audio.current;
      if (!a) return;
      want.current = play;
      setLoading(true);
      setMarks([]);
      setLines(null);
      text(s, i);
      try {
        const { blob, marks: m } = await blobFor(s, i);
        if (live.current.idx !== i || live.current.src?.id !== s.id) return;
        setMarks(m);
        const key = urlOf(s, i);
        let u = urls.current.get(key);
        if (!u) {
          u = URL.createObjectURL(blob);
          urls.current.set(key, u);
        }
        a.src = u;
        a.playbackRate = live.current.speed;
        if (startAt.current) {
          const sec = startAt.current;
          startAt.current = 0;
          a.addEventListener("loadedmetadata", () => (a.currentTime = sec), { once: true });
        }
        if (want.current) await a.play().catch(() => {});
        // The next part is ready before this one ends (also with the screen off).
        if (i + 1 < s.segments) void blobFor(s, i + 1).catch(() => {});
      } catch (e) {
        const err = e as Error & { premium?: boolean };
        if (err.message === "PREMIUM_REQUIRED" || err.premium === false)
          errorToast(te, { code: err.message, details: { premium: err.premium } });
        else
          toast.error(
            err.message === "RATE_LIMITED"
              ? t("limit")
              : err.message === "AI_QUOTA"
                ? t("ttsQuota")
                : t("voiceFailed"),
          );
        setPlaying(false);
      } finally {
        if (live.current.idx === i) setLoading(false);
      }
    },
    [blobFor, t, te, text, urlOf],
  );

  const go = useCallback(
    (i: number, play?: boolean) => {
      const s = live.current.src;
      if (!s || i < 0 || i >= s.segments) return;
      const keep = play ?? (live.current.playing || want.current);
      audio.current?.pause();
      live.current.idx = i;
      setIdx(i);
      void load(s, i, keep);
      savePos();
    },
    [load, savePos],
  );

  const open = useCallback(
    (s: AudiobookSource) => {
      const cur = live.current.src;
      if (cur?.id === s.id && cur.version === s.version) return;
      audio.current?.pause();
      live.current.src = s;
      live.current.idx = s.startIdx;
      setSrc(s);
      setIdx(s.startIdx);
      setTime({ cur: 0, dur: 0 });
      startAt.current = s.startSec;
      text(s, s.startIdx);
      // Opening costs nothing: the voice is loaded only if this browser has it.
      void caches
        ?.open(CACHE)
        .then((c) => c.match(urlOf(s, s.startIdx)))
        .then((hit) => {
          if (hit) void load(s, s.startIdx, false);
        })
        .catch(() => {});
    },
    [load, text, urlOf],
  );

  const toggle = useCallback(() => {
    const a = audio.current;
    const s = live.current.src;
    if (!a || !s) return;
    if (a.paused) {
      want.current = true;
      if (a.getAttribute("src")) void a.play();
      else void load(s, live.current.idx, true);
    } else {
      want.current = false;
      a.pause();
      savePos();
    }
  }, [load, savePos]);

  const seekTo = useCallback((v: number) => {
    const a = audio.current;
    if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, v));
  }, []);
  const seek = useCallback((d: number) => seekTo((audio.current?.currentTime ?? 0) + d), [seekTo]);
  const close = useCallback(() => {
    savePos();
    const a = audio.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
    }
    live.current.src = null;
    setSrc(null);
    setPlaying(false);
  }, [savePos]);

  // Save the place now and then, and when leaving.
  useEffect(() => {
    const timer = setInterval(() => live.current.playing && savePos(), 15_000);
    window.addEventListener("pagehide", savePos);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", savePos);
    };
  }, [savePos]);

  // Sleep timer by time.
  useEffect(() => {
    if (typeof sleep !== "number") return;
    const timer = setInterval(() => {
      if (Date.now() < sleep) return;
      audio.current?.pause();
      setSleep(null);
      savePos();
    }, 5000);
    return () => clearInterval(timer);
  }, [sleep, savePos]);

  // The highlight follows the voice smoothly while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (a)
        setTime((x) =>
          Math.abs(x.cur - a.currentTime) > 0.04 ? { cur: a.currentTime, dur: a.duration || 0 } : x,
        );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Headphones, the lock screen and keyboard media keys.
  useEffect(() => {
    if (!src || !("mediaSession" in navigator)) return;
    const c = [...src.chapterAt].reverse().findIndex((at) => at <= idx);
    const title =
      c >= 0
        ? src.chapters[src.chapterAt.length - 1 - c]
        : `${t("part", { n: idx + 1, total: src.segments })}`;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || src.title,
      artist: src.authors || src.title,
      album: src.title,
      artwork: src.cover ? [{ src: src.cover, sizes: "512x512" }] : [],
    });
    const m = navigator.mediaSession;
    m.setActionHandler("play", toggle);
    m.setActionHandler("pause", toggle);
    m.setActionHandler("previoustrack", () => go(live.current.idx - 1));
    m.setActionHandler("nexttrack", () => go(live.current.idx + 1));
    m.setActionHandler("seekbackward", (d) => seek(-(d.seekOffset ?? 10)));
    m.setActionHandler("seekforward", (d) => seek(d.seekOffset ?? 10));
    try {
      m.setActionHandler("seekto", (d) => d.seekTime != null && seekTo(d.seekTime));
    } catch {
      /* not supported */
    }
  }, [src, idx, go, seek, seekTo, t, toggle]);
  useEffect(() => {
    if (!src || !("mediaSession" in navigator) || !time.dur) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: time.dur,
        position: Math.min(time.cur, time.dur),
        playbackRate: speed,
      });
    } catch {
      /* not supported */
    }
    // Once a second is enough for the lock screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, time.dur, Math.floor(time.cur), speed]);

  // Keys everywhere, like a video player: the site's shortcuts (works while
  // typing); and, outside text fields, Space / K, ← →, J / L, < >.
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      const k = getShortcuts();
      let act: (() => void) | null = null;
      if (matches(e, k.playPause)) act = toggle;
      else if (matches(e, k.back5)) act = () => seek(-5);
      else if (matches(e, k.fwd5)) act = () => seek(5);
      else {
        const el = e.target as HTMLElement;
        const typing =
          /input|textarea|select/i.test(el.tagName) ||
          el.isContentEditable ||
          e.metaKey ||
          e.ctrlKey;
        if (!typing && !e.altKey) {
          const key = e.key.toLowerCase();
          // In the reader Space and the arrows turn the page.
          const reading = !!document.documentElement.dataset.reader;
          if (key === "k" || (e.code === "Space" && !reading)) act = toggle;
          else if (e.key === "ArrowLeft" && !reading) act = () => seek(-5);
          else if (e.key === "ArrowRight" && !reading) act = () => seek(5);
          else if (key === "j") act = () => seek(-10);
          else if (key === "l") act = () => seek(10);
          else if (e.key === ">" || e.key === "<")
            act = () => {
              const i = SPEEDS.indexOf(live.current.speed);
              const n = SPEEDS[i + (e.key === ">" ? 1 : -1)];
              if (n) setSpeed(n);
            };
        }
      }
      if (act) {
        e.preventDefault();
        e.stopImmediatePropagation();
        act();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [src, seek, setSpeed, toggle]);

  const value = useMemo<Engine>(
    () => ({
      src,
      idx,
      playing,
      loading,
      time,
      lines,
      marks,
      speed,
      speeds: SPEEDS,
      sleep,
      setSleep,
      setSpeed,
      open,
      go,
      toggle,
      seek,
      seekTo,
      close,
    }),
    [
      src,
      idx,
      playing,
      loading,
      time,
      lines,
      marks,
      speed,
      sleep,
      setSpeed,
      open,
      go,
      toggle,
      seek,
      seekTo,
      close,
    ],
  );

  const onItsPage = !!src && pathname === `/library/${src.id}/audiobook`;
  return (
    <Ctx.Provider value={value}>
      {children}
      <audio
        ref={audio}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) =>
          setTime({ cur: e.currentTarget.currentTime, dur: e.currentTarget.duration || 0 })
        }
        onEnded={() => {
          const l = live.current;
          const next = l.idx + 1;
          // Sleep timer "end of chapter": stop before the next chapter begins.
          if (l.sleep === "chapter" && l.src?.chapterAt.includes(next)) {
            setSleep(null);
            setPlaying(false);
            savePos();
            return;
          }
          if (l.src && next < l.src.segments) go(next, true);
          else setPlaying(false);
        }}
      />
      {src && !onItsPage && (
        <div className="border-border bg-surface/95 fixed inset-x-3 bottom-[calc(var(--bottom-nav,0px)+0.75rem)] z-40 mx-auto flex max-w-xl items-center gap-2 rounded-2xl border p-2 shadow-xl backdrop-blur lg:left-[calc(var(--sidebar,248px)+1rem)]">
          <Link
            href={`/library/${src.id}/audiobook`}
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-xl">
              <Headphones className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{src.title}</span>
              <span className="text-muted block truncate text-xs tabular-nums">
                {t("part", { n: idx + 1, total: src.segments })}
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => seek(-10)}
            aria-label={t("back15")}
            className="text-muted hover:text-foreground rounded-full p-1.5"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? t("pause") : t("play")}
            className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : playing ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4 translate-x-px" />
            )}
          </button>
          <button
            type="button"
            onClick={() => seek(10)}
            aria-label={t("fwd15")}
            className="text-muted hover:text-foreground rounded-full p-1.5"
          >
            <RotateCw className="size-4" />
          </button>
          <button
            type="button"
            onClick={close}
            aria-label={t("closePlayer")}
            className="text-muted hover:text-foreground rounded-full p-1.5"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </Ctx.Provider>
  );
}

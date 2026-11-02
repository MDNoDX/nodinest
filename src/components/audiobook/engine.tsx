"use client";
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

/** What the player needs to know about the book that is playing. */
export type AudiobookSource = {
  id: string;
  title: string;
  authors: string;
  cover: string | null;
  /** Changes with the analysis / the voice: another URL, another recording. */
  version: string;
  /** Each character in their own voice, not one reader. */
  cast: boolean;
  segments: number;
  /** Segment index where each chapter starts. */
  chapterAt: number[];
  chapters: string[];
  startIdx: number;
  startSec: number;
};

type Seg = { blob: Blob };
const CACHE = "nn-audiobook";

/** One part's MP3 (kept in the browser, so it never comes twice). */
async function segmentBlob(url: string, signal?: AbortSignal): Promise<Seg> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return { blob: await hit.blob() };
  } catch {
    cache = null;
  }
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string; premium?: boolean };
    throw Object.assign(new Error(d.error ?? "INTERNAL"), { premium: d.premium });
  }
  if (cache) await cache.put(url, res.clone()).catch(() => {});
  return { blob: await res.blob() };
}

/** How long a part took to make, on average here (for an honest progress ring). */
const MAKE_KEY = "nn:abook-make-ms";
const readMakeMs = () => {
  try {
    return Number(localStorage.getItem(MAKE_KEY)) || 45_000;
  } catch {
    return 45_000;
  }
};

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

const queueKey = (id: string) => `nn:abook-queue:${id}`;
const stopsQueue = (e: Error & { premium?: boolean }) =>
  ["AI_QUOTA", "RATE_LIMITED", "PREMIUM_REQUIRED"].includes(e.message) || e.premium === false;

type Engine = {
  src: AudiobookSource | null;
  idx: number;
  playing: boolean;
  loading: boolean;
  /** Parts this browser already has. */
  ready: Set<number>;
  /** Parts ordered, in the order they will be made. */
  queue: number[];
  /** The part being made right now, since when, and how long one usually takes. */
  making: number | null;
  makingAt: number | null;
  makeMs: number;
  /** Puts a part first in line to be made (the current one, from the big button). */
  prepare: (i: number) => void;
  /** A ready part plays; any other is ordered (or taken off the order). */
  pick: (i: number) => void;
  /** Orders parts from..to (a chapter) without leaving the current one. */
  orderParts: (from: number, to: number) => void;
  prepareAll: () => void;
  stopQueue: () => void;
  time: { cur: number; dur: number };
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
 * the site, with the screen off and from the headphones' buttons; the top bar
 * shows it on every page (header-player.tsx).
 */
export function AudiobookProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("audiobook");
  const te = useTranslations("errors");
  const audio = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<AudiobookSource | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
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
  /** The URL of the part the <audio> element holds. */
  const loaded = useRef("");
  const [ready, setReady] = useState<Set<number>>(new Set());
  const readyRef = useRef(ready);
  const [queue, setQueueState] = useState<number[]>([]);
  const queueRef = useRef(queue);
  const [making, setMaking] = useState<number | null>(null);
  const [makingAt, setMakingAt] = useState<number | null>(null);
  const [makeMs, setMakeMs] = useState(45_000);
  const stopper = useRef<AbortController | null>(null);
  /** A part to start as soon as it is made (listening straight through). */
  const playWhenMade = useRef<number | null>(null);
  const working = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      setSpeedState(readSpeed());
      setMakeMs(readMakeMs());
    });
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
    (s: AudiobookSource, i: number) =>
      `/api/audiobook/${s.id}/segment/${i}?v=${s.version}${s.cast ? "&cast=1" : ""}`,
    [],
  );
  const blobFor = useCallback(
    (s: AudiobookSource, i: number, signal?: AbortSignal) => {
      const url = urlOf(s, i);
      let p = inflight.current.get(url);
      if (!p) {
        p = segmentBlob(url, signal);
        inflight.current.set(url, p);
        const done = () => void inflight.current.delete(url);
        p.then(done, done);
      }
      return p;
    },
    [urlOf],
  );
  const setQueue = useCallback((id: string, q: number[]) => {
    queueRef.current = q;
    setQueueState(q);
    try {
      if (q.length) localStorage.setItem(queueKey(id), JSON.stringify(q));
      else localStorage.removeItem(queueKey(id));
    } catch {
      /* ignore */
    }
  }, []);
  const markReady = useCallback(
    (s: AudiobookSource, i: number) => {
      if (live.current.src?.id !== s.id || live.current.src.version !== s.version) return;
      if (!readyRef.current.has(i)) {
        readyRef.current = new Set(readyRef.current).add(i);
        setReady(readyRef.current);
      }
      if (queueRef.current.includes(i))
        setQueue(
          s.id,
          queueRef.current.filter((x) => x !== i),
        );
    },
    [setQueue],
  );
  /** Makes the ordered parts one by one, behind whatever is playing. */
  const pump = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    for (;;) {
      const s = live.current.src;
      const i = queueRef.current[0];
      if (!s || i == null) break;
      setMaking(i);
      const began = Date.now();
      setMakingAt(began);
      const ctl = new AbortController();
      stopper.current = ctl;
      try {
        await blobFor(s, i, ctl.signal);
        markReady(s, i);
        const avg = Math.round(readMakeMs() * 0.7 + (Date.now() - began) * 0.3);
        setMakeMs(avg);
        try {
          localStorage.setItem(MAKE_KEY, String(avg));
        } catch {
          /* ignore */
        }
        if (playWhenMade.current === i && live.current.idx === i) {
          playWhenMade.current = null;
          void loadRef.current?.(s, i, true);
        }
      } catch (e) {
        const err = e as Error & { premium?: boolean };
        // Cancelled: the queue is already empty.
        if (err.name === "AbortError") break;
        if (stopsQueue(err)) {
          // The order stays: it goes on when the voice is available again.
          toast.error(
            err.message === "PREMIUM_REQUIRED" ? te("PREMIUM_REQUIRED") : t("queueStopped"),
          );
          break;
        }
        toast.error(t("voiceFailed"));
        if (live.current.src?.id === s.id)
          setQueue(
            s.id,
            queueRef.current.filter((x) => x !== i),
          );
      }
    }
    setMaking(null);
    setMakingAt(null);
    stopper.current = null;
    working.current = false;
  }, [blobFor, markReady, setQueue, t, te]);
  const loadRef = useRef<((s: AudiobookSource, i: number, play: boolean) => Promise<void>) | null>(
    null,
  );
  const prepareRef = useRef<((i: number) => void) | null>(null);
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
      setLoading(play);
      try {
        const { blob } = await blobFor(s, i);
        markReady(s, i);
        if (live.current.idx !== i || live.current.src?.id !== s.id) return;
        const key = urlOf(s, i);
        let u = urls.current.get(key);
        if (!u) {
          u = URL.createObjectURL(blob);
          urls.current.set(key, u);
        }
        a.src = u;
        loaded.current = key;
        a.playbackRate = live.current.speed;
        if (startAt.current) {
          const sec = startAt.current;
          startAt.current = 0;
          a.addEventListener("loadedmetadata", () => (a.currentTime = sec), { once: true });
        }
        if (want.current) await a.play().catch(() => {});
        // The next part is ready before this one ends (also with the screen off).
        const next = i + 1;
        if (want.current && next < s.segments && !readyRef.current.has(next)) {
          setQueue(s.id, [next, ...queueRef.current.filter((x) => x !== next)]);
          void pump();
        }
      } catch (e) {
        if (live.current.idx !== i) return;
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
        want.current = false;
        setPlaying(false);
      } finally {
        if (live.current.idx === i) setLoading(false);
      }
    },
    [blobFor, markReady, pump, setQueue, t, te, urlOf],
  );

  const go = useCallback(
    (i: number, play?: boolean) => {
      const s = live.current.src;
      if (!s || i < 0 || i >= s.segments) return;
      const keep = play ?? (live.current.playing || want.current);
      const a = audio.current;
      a?.pause();
      live.current.idx = i;
      setIdx(i);
      setTime({ cur: 0, dur: 0 });
      if (readyRef.current.has(i)) void load(s, i, keep);
      else if (keep) {
        // Listening on into a part not made yet: make it, then go on by itself.
        playWhenMade.current = i;
        loaded.current = "";
        a?.removeAttribute("src");
        prepareRef.current?.(i);
      } else {
        // Only moved here: the voice is not made until it is asked for.
        want.current = false;
        setLoading(false);
        loaded.current = "";
        a?.removeAttribute("src");
        a?.load();
      }
      savePos();
    },
    [load, savePos],
  );

  const pick = useCallback(
    (i: number) => {
      const s = live.current.src;
      if (!s) return;
      if (readyRef.current.has(i) || i === live.current.idx) return go(i, true);
      const q = queueRef.current;
      setQueue(s.id, q.includes(i) ? q.filter((x) => x !== i) : [...q, i]);
      void pump();
    },
    [go, pump, setQueue],
  );
  const orderParts = useCallback(
    (from: number, to: number) => {
      const s = live.current.src;
      if (!s) return;
      const q = queueRef.current;
      const add: number[] = [];
      for (let i = from; i <= to; i++) if (!readyRef.current.has(i) && !q.includes(i)) add.push(i);
      setQueue(s.id, [...q, ...add]);
      void pump();
    },
    [pump, setQueue],
  );
  const prepareAll = useCallback(() => {
    const s = live.current.src;
    if (!s) return;
    const at = live.current.idx;
    const all = Array.from({ length: s.segments }, (_, k) => (at + k) % s.segments);
    setQueue(
      s.id,
      all.filter((i) => !readyRef.current.has(i)),
    );
    void pump();
  }, [pump, setQueue]);
  const stopQueue = useCallback(() => {
    const s = live.current.src;
    if (s) setQueue(s.id, []);
    playWhenMade.current = null;
    stopper.current?.abort();
  }, [setQueue]);
  const prepare = useCallback(
    (i: number) => {
      const s = live.current.src;
      if (!s || readyRef.current.has(i)) return;
      setQueue(s.id, [i, ...queueRef.current.filter((x) => x !== i)]);
      void pump();
    },
    [pump, setQueue],
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
      loaded.current = "";
      startAt.current = s.startSec;
      readyRef.current = new Set();
      setReady(readyRef.current);
      let saved: number[] = [];
      try {
        saved = JSON.parse(localStorage.getItem(queueKey(s.id)) ?? "[]");
      } catch {
        /* ignore */
      }
      queueRef.current = saved.filter((i) => i < s.segments);
      setQueueState(queueRef.current);
      // Opening costs nothing: the voice is loaded only if this browser has it.
      void caches
        ?.open(CACHE)
        .then((c) => c.keys())
        .then((keys) => {
          const have = new Set(keys.map((k) => k.url.slice(k.url.indexOf("/api/"))));
          if (live.current.src !== s) return;
          const found = new Set<number>();
          for (let i = 0; i < s.segments; i++) if (have.has(urlOf(s, i))) found.add(i);
          readyRef.current = found;
          setReady(found);
          setQueue(
            s.id,
            queueRef.current.filter((i) => !found.has(i)),
          );
          if (found.has(s.startIdx)) void load(s, s.startIdx, false);
        })
        .catch(() => {});
    },
    [load, setQueue, urlOf],
  );

  useEffect(() => {
    loadRef.current = load;
    prepareRef.current = prepare;
  });

  const toggle = useCallback(() => {
    const a = audio.current;
    const s = live.current.src;
    if (!a || !s) return;
    if (a.paused) {
      const i = live.current.idx;
      if (loaded.current === urlOf(s, i)) {
        want.current = true;
        void a.play();
      } else if (readyRef.current.has(i)) void load(s, i, true);
      // Not made yet: the big button asks for it; it is heard once it is ready.
      else prepare(i);
    } else {
      want.current = false;
      a.pause();
      savePos();
    }
  }, [load, prepare, savePos, urlOf]);

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
    loaded.current = "";
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
      ready,
      queue,
      making,
      makingAt,
      makeMs,
      prepare,
      pick,
      orderParts,
      prepareAll,
      stopQueue,
      time,
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
      ready,
      queue,
      making,
      makingAt,
      makeMs,
      prepare,
      pick,
      orderParts,
      prepareAll,
      stopQueue,
      time,
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
    </Ctx.Provider>
  );
}

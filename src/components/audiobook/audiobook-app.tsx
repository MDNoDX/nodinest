"use client";
import {
  ArrowLeft,
  BookOpen,
  Headphones,
  ListOrdered,
  Loader2,
  Mic2,
  Pause,
  Play,
  Square,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { analyzeAudiobookAction, setVoiceAction } from "@/app/actions/audiobook";
import { Cover } from "@/components/library/cover";
import { PdfPage } from "@/components/reader/pdf-page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Analysis, AudiobookView, ScriptLine } from "@/server/audiobook";
import { errorToast } from "@/lib/error-toast";

type Res = { id: string; title: string; type: string; cover: string | null; authors: string };
type Voice = { name: string; female: boolean; d: string; role?: string };

/** One voice sample plays at a time, page-wide; a second press stops it. */
const sample = { audio: null as HTMLAudioElement | null, id: "", urls: new Map<string, string>() };
const SAMPLE_EVENT = "nn:voice-sample";

const SPEEDS = [0.75, 0.85, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
/** An unhurried narrator by default; the listener's choice is kept (this device). */
const SPEED_KEY = "nn:abook-speed";
function readSpeed() {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(v) ? v : 0.9;
  } catch {
    return 0.9;
  }
}
function subscribeSpeed(cb: () => void) {
  window.addEventListener(SPEED_KEY, cb);
  return () => window.removeEventListener(SPEED_KEY, cb);
}
function saveSpeed(v: number) {
  try {
    localStorage.setItem(SPEED_KEY, String(v));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(SPEED_KEY));
}
/**
 * Voices: one narrator (default — the book's own words, fast, no AI script)
 * or every character in their own voice. Kept per device.
 */
const CAST_KEY = "nn:abook-cast";
function readCast() {
  try {
    return localStorage.getItem(CAST_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribeCast(cb: () => void) {
  window.addEventListener(CAST_KEY, cb);
  return () => window.removeEventListener(CAST_KEY, cb);
}
function saveCast(v: boolean) {
  try {
    localStorage.setItem(CAST_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CAST_KEY));
}
/** Is this segment already in the browser (then it plays without asking the server)? */
async function inBrowser(url: string) {
  try {
    return !!(await (await caches.open(CACHE)).match(url));
  } catch {
    return false;
  }
}

/** Audio made with an older pacing is made again (the URL changes). */
const AUDIO_VERSION = "p3";
const SLEEP = [15, 30, 45, 60] as const;
const CACHE = "nn-audiobook";
/** Stable colours for speakers (narrator stays neutral). */
const HUES = [
  "var(--c-blue)",
  "var(--c-rose)",
  "var(--c-teal)",
  "var(--c-amber)",
  "var(--c-violet)",
];

/** Segment audio from the browser cache, or made by the server (then cached). */
type Seg = { blob: Blob; marks: number[] };
const marksOf = (r: Response) =>
  (r.headers.get("x-nn-marks") ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);

/** One segment's MP3 + when each line starts (cached in the browser with its headers). */
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
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "INTERNAL");
  if (cache) await cache.put(url, res.clone()).catch(() => {});
  return { marks: marksOf(res), blob: await res.blob() };
}

export function AudiobookApp({
  resource,
  view,
  hasText,
  voices,
}: {
  resource: Res;
  view: AudiobookView | null;
  hasText: boolean;
  voices: Voice[];
}) {
  const t = useTranslations("audiobook");
  const te = useTranslations("errors");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const errText = (code: string | null) =>
    code && te.has(code as "INTERNAL") ? te(code as "INTERNAL") : t("failed");
  const analyzing = busy || view?.status === "analyzing";

  // The analysis also starts by itself after a PDF upload: wait for it.
  useEffect(() => {
    if (view?.status !== "analyzing" || busy) return;
    const timer = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(timer);
  }, [view?.status, busy, router]);

  const analyze = async () => {
    setBusy(true);
    const r = await analyzeAudiobookAction(resource.id).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return toast.error(errText(r && !r.ok ? r.code : null));
    toast.success(t("ready"));
    router.refresh();
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href={`/library/${resource.id}`}
        className="text-muted hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> {resource.title}
      </Link>
      {!hasText ? (
        <section className="card flex flex-col items-center gap-3 p-8 text-center">
          <Headphones className="text-primary size-10" />
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-muted max-w-md text-sm">{t("needPdf")}</p>
          <Button asChild>
            <Link href={`/library/${resource.id}#reading`}>{t("addPdf")}</Link>
          </Button>
        </section>
      ) : view?.status === "ready" && view.analysis ? (
        <Ready resource={resource} view={view} voices={voices} onReanalyze={analyze} busy={busy} />
      ) : (
        <section className="card relative overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Cover
              type={resource.type as "book"}
              title={resource.title}
              author={resource.authors}
              src={resource.cover}
              size="lg"
              className="w-32 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                {t("title")}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{resource.title}</h1>
              <p className="text-muted mt-2 max-w-xl text-sm leading-relaxed">{t("intro")}</p>
              {view?.status === "failed" && (
                <p className="text-danger mt-2 text-sm">{errText(view.error)}</p>
              )}
              <div className="mt-4">
                {analyzing ? (
                  <Steps />
                ) : (
                  <Button onClick={() => void analyze()}>
                    <Sparkles /> {t("prepare")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/** What the AI is doing while it reads the whole book. */
function Steps() {
  const t = useTranslations("audiobook");
  const [n, setN] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setN((x) => Math.min(x + 1, 3)), 12_000);
    return () => clearInterval(timer);
  }, []);
  const steps = [t("step1"), t("step2"), t("step3"), t("step4")];
  return (
    <ol className="flex flex-col gap-1.5 text-sm" aria-live="polite">
      {steps.map((s, i) => (
        <li
          key={s}
          className={cn("flex items-center gap-2", i > n ? "text-muted/60" : "text-foreground")}
        >
          {i === n ? (
            <Loader2 className="text-primary size-4 animate-spin" />
          ) : (
            <span
              className={cn("size-2 rounded-full", i < n ? "bg-primary" : "bg-border-strong")}
            />
          )}
          {s}
        </li>
      ))}
      <li className="text-muted mt-1 text-xs">{t("takes")}</li>
    </ol>
  );
}

function Ready({
  resource,
  view,
  voices,
  onReanalyze,
  busy,
}: {
  resource: Res;
  view: AudiobookView;
  voices: Voice[];
  onReanalyze: () => void;
  busy: boolean;
}) {
  const t = useTranslations("audiobook");
  const te = useTranslations("errors");
  const [analysis, setAnalysis] = useState<Analysis>(view.analysis!);
  const [tab, setTab] = useState<"text" | "chapters" | "about" | "cast">("text");
  const [idx, setIdx] = useState(Math.min(view.position.idx, Math.max(0, view.segments - 1)));
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const speed = useSyncExternalStore(subscribeSpeed, readSpeed, () => 0.9);
  const cast = useSyncExternalStore(subscribeCast, readCast, () => false);
  const setSpeed = saveSpeed;
  // Sleep timer: a time to stop at, or the end of the chapter.
  const [sleep, setSleep] = useState<number | "chapter" | null>(null);
  const [lines, setLines] = useState<ScriptLine[] | null>(null);
  const [draft, setDraft] = useState(false);
  // Start time (s) of each script line in the playing segment; [] = unknown.
  const [marks, setMarks] = useState<number[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<number, string>());
  const inflight = useRef(new Map<string, Promise<Seg>>());
  const startAt = useRef(view.position.sec);
  const want = useRef(false);
  // Latest values for event handlers (set in effects, read outside render).
  const live = useRef({ idx, playing });
  useEffect(() => {
    live.current.playing = playing;
  }, [playing]);

  const segUrl = useCallback(
    (i: number) =>
      `/api/audiobook/${resource.id}/segment/${i}?v=${analysis.rev ?? "0"}.${analysis.voiceRev ?? 1}.${AUDIO_VERSION}${cast ? "&cast=1" : ""}`,
    [resource.id, analysis.rev, analysis.voiceRev, cast],
  );
  const blobFor = useCallback(
    (i: number) => {
      const url = segUrl(i);
      let p = inflight.current.get(url);
      if (!p) {
        p = segmentBlob(url);
        inflight.current.set(url, p);
        p.catch(() => inflight.current.delete(url));
      }
      return p;
    },
    [segUrl],
  );

  const chapterOf = (i: number) => {
    let c = -1;
    view.chapterAt.forEach((at, k) => {
      if (at <= i) c = k;
    });
    return c >= 0 ? analysis.chapters[c] : null;
  };

  const savePos = useCallback(() => {
    const a = audio.current;
    void fetch(`/api/audiobook/${resource.id}/position`, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idx: live.current.idx, sec: a ? Math.floor(a.currentTime) : 0 }),
    }).catch(() => {});
  }, [resource.id]);

  /** The text of segment i (no AI: the book's own words, or the cached script). */
  const script = useCallback(
    (i: number, fast: boolean) =>
      fetch(
        `/api/audiobook/${resource.id}/script/${i}${fast ? `?fast=1${cast ? "" : "&plain=1"}` : ""}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { lines: ScriptLine[]; draft?: boolean } | null) => {
          if (d && live.current.idx === i) {
            setLines(d.lines);
            setDraft(!!d.draft);
          }
          return d;
        })
        .catch(() => null),
    [resource.id, cast],
  );

  /** Loads segment i into the player (and plays it if wanted). */
  const load = useCallback(
    async (i: number, play: boolean) => {
      const a = audio.current;
      if (!a) return;
      want.current = play;
      setLoading(true);
      setLines(null);
      setDraft(false);
      setMarks([]);
      // The text first (the book's own words at once), the voice after.
      const first = script(i, true);
      try {
        const { blob, marks: m } = await blobFor(i);
        setMarks(m);
        if (live.current.idx !== i) return;
        let src = urls.current.get(i);
        if (!src) {
          src = URL.createObjectURL(blob);
          urls.current.set(i, src);
        }
        a.src = src;
        a.playbackRate = speed;
        if (startAt.current) {
          const s = startAt.current;
          startAt.current = 0;
          a.addEventListener("loadedmetadata", () => (a.currentTime = s), { once: true });
        }
        if (want.current) await a.play().catch(() => {});
        // Voicing made the speaker script: swap the plain text for it.
        if (cast)
          void first.then((d) => {
            if (!d || d.draft) void script(i, false);
          });
        // Make the next one while this one plays.
        if (i + 1 < view.segments) void blobFor(i + 1).catch(() => {});
      } catch (e) {
        const code = e instanceof Error ? e.message : "INTERNAL";
        toast.error(
          code === "RATE_LIMITED"
            ? t("limit")
            : code === "AI_QUOTA"
              ? t("ttsQuota")
              : t("voiceFailed"),
        );
        setPlaying(false);
      } finally {
        if (live.current.idx === i) setLoading(false);
      }
    },
    [blobFor, script, cast, speed, t, view.segments],
  );

  const go = (i: number, play = live.current.playing || want.current) => {
    if (i < 0 || i >= view.segments) return;
    audio.current?.pause();
    setIdx(i);
    live.current.idx = i;
    void load(i, play);
    savePos();
  };

  // Opening the page costs nothing: the text is shown, and the voice is
  // loaded only if this browser already has it (else it is made on ▶).
  useEffect(() => {
    const i = live.current.idx;
    void inBrowser(segUrl(i)).then((has) => {
      if (has) void load(i, false);
      else void script(i, true);
    });
    const map = urls.current;
    return () => {
      for (const u of map.values()) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  // Narrator ↔ cast: the same place, in the other way of reading.
  const castFirst = useRef(true);
  useEffect(() => {
    if (castFirst.current) {
      castFirst.current = false;
      return;
    }
    const a = audio.current;
    const play = !!a && !a.paused;
    if (a) {
      startAt.current = a.currentTime;
      a.pause();
      a.removeAttribute("src");
    }
    for (const u of urls.current.values()) URL.revokeObjectURL(u);
    urls.current.clear();
    if (play) void load(live.current.idx, true);
    else void script(live.current.idx, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cast]);

  // Save the place now and then, and when leaving.
  useEffect(() => {
    const timer = setInterval(() => live.current.playing && savePos(), 15_000);
    const leave = () => savePos();
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
    };
  }, [savePos]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      want.current = true;
      if (a.src) void a.play();
      else void load(idx, true);
    } else {
      want.current = false;
      a.pause();
      savePos();
    }
  };
  const seek = (d: number) => {
    const a = audio.current;
    if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d));
  };

  // Sleep timer by time: pause when it is up (a gentle stop, the place is saved).
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

  // Lock screen / headphone buttons.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ch = chapterOf(idx);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ch?.title ?? resource.title,
      artist: resource.authors || resource.title,
      album: resource.title,
      artwork: resource.cover ? [{ src: resource.cover }] : [],
    });
    navigator.mediaSession.setActionHandler("play", toggle);
    navigator.mediaSession.setActionHandler("pause", toggle);
    navigator.mediaSession.setActionHandler("previoustrack", () => go(live.current.idx - 1));
    navigator.mediaSession.setActionHandler("nexttrack", () => go(live.current.idx + 1));
    navigator.mediaSession.setActionHandler("seekbackward", (d) => seek(-(d.seekOffset ?? 5)));
    navigator.mediaSession.setActionHandler("seekforward", (d) => seek(d.seekOffset ?? 5));
    try {
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        const a = audio.current;
        if (a && d.seekTime != null) a.currentTime = d.seekTime;
      });
    } catch {
      /* not supported */
    }
  });
  // The lock screen's progress bar.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !time.dur) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: time.dur,
        position: Math.min(time.cur, time.dur),
        playbackRate: speed,
      });
    } catch {
      /* not supported */
    }
  }, [time.dur, Math.floor(time.cur), speed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Space = play / pause, ← / → = 5 s back / forward (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/input|textarea|select/i.test(el.tagName) || el.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        seek(e.key === "ArrowLeft" ? -5 : 5);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The highlight follows the voice every frame (timeupdate fires only ~4×/s).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (a)
        setTime((t) =>
          Math.abs(t.cur - a.currentTime) > 0.04 ? { cur: a.currentTime, dur: a.duration || 0 } : t,
        );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // The line being read, estimated from the time (lines are spoken in order).
  const chars = lines?.map((l) => l.text.length) ?? [];
  const totalChars = chars.reduce((a, b) => a + b, 0) || 1;
  let current = -1;
  if (lines && !draft && marks.length === lines.length) {
    // Exact: the server measured where each line starts.
    for (let i = 0; i < marks.length; i++) if (marks[i] <= time.cur + 0.05) current = i;
  } else if (lines && time.dur) {
    const target = (time.cur / time.dur) * totalChars;
    for (let i = 0, acc = 0; i < chars.length; i++) {
      acc += chars[i];
      if (acc >= target) {
        current = i;
        break;
      }
    }
  }
  const speakers = ["narrator", ...analysis.characters.map((c) => c.name)];
  const hueOf = (s: string) =>
    s === "narrator" ? null : HUES[(speakers.indexOf(s) - 1 + HUES.length) % HUES.length];
  const ch = chapterOf(idx);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const changeVoice = async (speaker: string, voice: string) => {
    const r = await setVoiceAction(resource.id, speaker, voice);
    if (!r.ok) return errorToast(te, r);
    setAnalysis((a) => ({
      ...a,
      voiceRev: r.data,
      narration: speaker === "narrator" ? { ...a.narration, voice: voice as never } : a.narration,
      characters: a.characters.map((c) =>
        c.name === speaker ? { ...c, voice: voice as never } : c,
      ),
    }));
    toast.success(t("voiceChanged"));
  };

  return (
    <>
      <audio
        ref={audio}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) =>
          setTime({ cur: e.currentTarget.currentTime, dur: e.currentTarget.duration || 0 })
        }
        onEnded={() => {
          const next = live.current.idx + 1;
          // Sleep timer "end of chapter": stop before the next chapter begins.
          if (sleep === "chapter" && view.chapterAt.includes(next)) {
            setSleep(null);
            setPlaying(false);
            savePos();
            return;
          }
          if (next < view.segments) go(next, true);
          else setPlaying(false);
        }}
      />
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <Cover
            type={resource.type as "book"}
            title={resource.title}
            author={resource.authors}
            src={resource.cover}
            size="lg"
            className="w-28 shrink-0 self-center sm:self-start"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-primary flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <Headphones className="size-3.5" /> {t("title")}
              <span
                className="bg-primary-soft rounded px-1.5 py-px text-[10px] tracking-normal normal-case"
                title={t("betaHint")}
              >
                beta
              </span>
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{resource.title}</h1>
            <p className="text-muted mt-0.5 truncate text-sm">
              {ch ? `${ch.title}${ch.subtitle ? ` (${ch.subtitle})` : ""}` : resource.authors} ·{" "}
              {t("page", { n: view.pageOf[idx] ?? 1 })} ·{" "}
              {t("part", { n: idx + 1, total: view.segments })}
            </p>
            {/* Segment progress */}
            <div className="mt-4">
              <input
                type="range"
                min={0}
                max={time.dur || 0}
                step={0.1}
                value={time.cur}
                disabled={!time.dur}
                onChange={(e) =>
                  audio.current && (audio.current.currentTime = Number(e.target.value))
                }
                aria-label={t("position")}
                className="w-full accent-[var(--primary)]"
              />
              <div className="text-muted flex justify-between text-xs tabular-nums">
                <span>{fmt(time.cur)}</span>
                <span>{time.dur ? fmt(time.dur) : "–:––"}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1 sm:justify-start">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => go(idx - 1)}
                aria-label={t("prev")}
              >
                <SkipBack />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => seek(-5)} aria-label={t("back15")}>
                <RotateCcw />
              </Button>
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? t("pause") : t("play")}
                className="bg-primary text-primary-foreground mx-1 grid size-14 place-items-center rounded-full shadow-md transition-transform active:scale-95"
              >
                {loading ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : playing ? (
                  <Pause className="size-6" />
                ) : (
                  <Play className="size-6 translate-x-0.5" />
                )}
              </button>
              <Button variant="ghost" size="icon" onClick={() => seek(5)} aria-label={t("fwd15")}>
                <RotateCw />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => go(idx + 1)}
                aria-label={t("next")}
              >
                <SkipForward />
              </Button>
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                aria-label={t("speed")}
                className="border-border-strong bg-surface ml-2 h-9 rounded-lg border px-2 text-sm tabular-nums"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
              <select
                value={sleep == null ? "" : String(sleep === "chapter" ? "chapter" : "on")}
                onChange={(e) => {
                  const v = e.target.value;
                  setSleep(
                    v === "" ? null : v === "chapter" ? "chapter" : Date.now() + Number(v) * 60_000,
                  );
                }}
                aria-label={t("sleep")}
                title={t("sleep")}
                className={cn(
                  "border-border-strong bg-surface h-9 rounded-lg border px-2 text-sm",
                  sleep != null && "border-primary text-primary",
                )}
              >
                <option value="">{t("sleepOff")}</option>
                {typeof sleep === "number" && <option value="on">{t("sleepOn")}</option>}
                {SLEEP.map((m) => (
                  <option key={m} value={m}>
                    {t("sleepMin", { n: m })}
                  </option>
                ))}
                <option value="chapter">{t("sleepChapter")}</option>
              </select>
            </div>
            <div
              role="radiogroup"
              aria-label={t("voicesMode")}
              className="bg-surface-2 mt-3 flex w-fit rounded-lg p-0.5 text-xs"
            >
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={cast === v}
                  onClick={() => saveCast(v)}
                  title={v ? t("modeCastHint") : t("modeNarratorHint")}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium",
                    cast === v ? "bg-surface text-foreground shadow-sm" : "text-muted",
                  )}
                >
                  {v ? t("modeCast") : t("modeNarrator")}
                </button>
              ))}
            </div>
            {loading && (
              <p className="text-muted mt-2 flex items-center gap-1.5 text-xs" aria-live="polite">
                <Loader2 className="size-3.5 animate-spin" /> {t("making")}
              </p>
            )}
          </div>
        </div>
        {/* Whole book progress */}
        <div className="bg-surface-2 h-1">
          <div
            className="bg-primary h-full transition-all"
            style={{ width: `${((idx + 1) / Math.max(1, view.segments)) * 100}%` }}
          />
        </div>
      </section>

      <div role="tablist" className="bg-surface-2 flex w-fit flex-wrap rounded-lg p-0.5 text-sm">
        {(
          [
            ["text", BookOpen, t("tabText")],
            ["chapters", ListOrdered, t("tabChapters")],
            ["about", Sparkles, t("tabAbout")],
            ["cast", Users, t("tabCast")],
          ] as const
        ).map(([k, Icon, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium",
              tab === k
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "text" && (
        <section className="card p-5 sm:p-7">
          {view.fileId && view.pictures.includes(view.pageOf[idx]) && (
            <figure className="mb-5">
              <PdfPage
                fileId={view.fileId}
                page={view.pageOf[idx]}
                alt={chapterOf(idx)?.title ?? resource.title}
                className="mx-auto max-w-md"
              />
            </figure>
          )}
          {!lines || (draft && !lines.length) ? (
            <p className="text-muted flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> {t("textLoading")}
            </p>
          ) : (
            <div className="flex flex-col gap-3 font-serif text-[17px] leading-relaxed">
              {draft && <p className="text-muted font-sans text-xs">{t("textDraft")}</p>}
              {lines.map((l, i) => {
                const hue = hueOf(l.speaker);
                return (
                  <p
                    key={i}
                    className={cn(
                      "rounded-lg px-2 py-1 transition-colors",
                      i === current && "bg-primary-soft",
                      hue && "border-l-[3px] pl-3",
                    )}
                    style={hue ? { borderColor: hue } : undefined}
                  >
                    {hue && (
                      <span
                        className="mr-2 font-sans text-xs font-semibold tracking-wide uppercase"
                        style={{ color: hue }}
                      >
                        {l.speaker}
                      </span>
                    )}
                    {l.text}
                  </p>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "chapters" && (
        <section className="card p-2">
          {analysis.chapters.length ? (
            <ol>
              {analysis.chapters.map((c, k) => {
                const at = view.chapterAt[k] ?? 0;
                const on = ch === c;
                return (
                  <li key={k}>
                    <button
                      type="button"
                      onClick={() => {
                        setTab("text");
                        go(at, true);
                      }}
                      className={cn(
                        "hover:bg-surface-2 flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left",
                        on && "bg-primary-soft text-primary font-medium",
                      )}
                    >
                      <span className="text-muted w-6 shrink-0 text-right text-xs tabular-nums">
                        {k + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        {c.title}
                        {c.subtitle && (
                          <span className="text-muted ml-1.5 text-xs">· {c.subtitle}</span>
                        )}
                      </span>
                      <span className="text-muted text-xs tabular-nums">
                        {t("page", { n: c.page })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-muted p-4 text-sm">{t("noChapters")}</p>
          )}
        </section>
      )}

      {tab === "about" && (
        <section className="card flex flex-col gap-4 p-5 sm:p-7">
          <div className="flex flex-wrap gap-2 text-xs">
            {[analysis.genre, analysis.language, analysis.tone].filter(Boolean).map((x) => (
              <span key={x} className="bg-surface-2 rounded-full px-2.5 py-1">
                {x}
              </span>
            ))}
          </div>
          {analysis.setting && (
            <p className="text-sm">
              <span className="text-muted">{t("setting")}: </span>
              {analysis.setting}
            </p>
          )}
          <p className="leading-relaxed">{analysis.summary}</p>
          {analysis.themes.length > 0 && (
            <div>
              <h3 className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
                {t("themes")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {analysis.themes.map((x) => (
                  <span
                    key={x}
                    className="bg-primary-soft text-primary rounded-full px-2.5 py-0.5 text-sm"
                  >
                    {x}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
              {t("narration")}
            </h3>
            <p className="text-sm leading-relaxed">{analysis.narration.style}</p>
          </div>
          {analysis.pronunciation.length > 0 && (
            <div>
              <h3 className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
                {t("pronunciation")}
              </h3>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {analysis.pronunciation.map((p) => (
                  <li key={p.written}>
                    <b>{p.written}</b> <span className="text-muted">→ {p.spoken}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
            <Button variant="outline" size="sm" disabled={busy} onClick={onReanalyze}>
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} {t("reanalyze")}
            </Button>
            {view.scanned && <span className="text-muted text-xs">{t("scanned")}</span>}
          </div>
        </section>
      )}

      {tab === "cast" && (
        <section className="grid gap-3 sm:grid-cols-2">
          <CastCard
            resourceId={resource.id}
            speaker="narrator"
            name={t("narrator")}
            sub={analysis.narration.style}
            voice={analysis.narration.voice}
            voices={voices}
            onVoice={(v) => void changeVoice("narrator", v)}
            hue={null}
          />
          {analysis.characters.map((c) => (
            <CastCard
              key={c.name}
              resourceId={resource.id}
              speaker={c.name}
              name={c.name}
              sub={[c.role, c.description, c.speech].filter(Boolean).join(" · ")}
              meta={`${t(`gender.${c.gender}`)} · ${t(`age.${c.age}`)}`}
              voice={c.voice}
              voices={voices}
              onVoice={(v) => void changeVoice(c.name, v)}
              hue={hueOf(c.name)}
            />
          ))}
          {!analysis.characters.length && (
            <p className="text-muted text-sm sm:col-span-2">{t("noCast")}</p>
          )}
        </section>
      )}
    </>
  );
}

function CastCard({
  resourceId,
  speaker,
  name,
  sub,
  meta,
  voice,
  voices,
  onVoice,
  hue,
}: {
  resourceId: string;
  speaker: string;
  name: string;
  sub: string;
  meta?: string;
  voice: string;
  voices: Voice[];
  onVoice: (v: string) => void;
  hue: string | null;
}) {
  const t = useTranslations("audiobook");
  const te = useTranslations("errors");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const id = `${speaker}|${voice}`;
  // Other cards stop when this one plays (and the other way round).
  useEffect(() => {
    const on = () => setPlaying(sample.id === id && !!sample.audio && !sample.audio.paused);
    window.addEventListener(SAMPLE_EVENT, on);
    return () => window.removeEventListener(SAMPLE_EVENT, on);
  }, [id]);
  const stop = () => {
    sample.audio?.pause();
    sample.audio = null;
    sample.id = "";
    window.dispatchEvent(new Event(SAMPLE_EVENT));
  };
  // A sentence or two of the book in this voice (made once, then kept).
  const listen = async () => {
    if (playing) return stop();
    stop();
    setBusy(true);
    try {
      let url = sample.urls.get(id);
      if (!url) {
        const r = await fetch(
          `/api/audiobook/${resourceId}/preview?voice=${encodeURIComponent(voice)}&speaker=${encodeURIComponent(speaker)}`,
        );
        if (!r.ok) {
          const code = ((await r.json().catch(() => ({}))) as { error?: string }).error;
          if (code === "PREMIUM_REQUIRED") return errorToast(te, code);
          toast.error(code === "RATE_LIMITED" ? t("previewLimit") : t("voiceFailed"));
          return;
        }
        url = URL.createObjectURL(await r.blob());
        sample.urls.set(id, url);
      }
      const a = new Audio(url);
      sample.audio = a;
      sample.id = id;
      a.onended = stop;
      await a.play();
      window.dispatchEvent(new Event(SAMPLE_EVENT));
    } catch {
      toast.error(t("voiceFailed"));
    } finally {
      setBusy(false);
    }
  };
  const roleOf = (v: Voice) => (v.role ? t(`role.${v.role}` as "role.man") : v.name);
  const options = voices.some((v) => v.name === voice)
    ? voices
    : [{ name: voice, female: false, d: "" }, ...voices];
  return (
    <article
      className="card flex flex-col gap-2 p-4"
      style={hue ? { borderTop: `3px solid ${hue}` } : undefined}
    >
      <div className="flex items-center gap-2">
        <Mic2 className="text-muted size-4" />
        <h3 className="font-semibold">{name}</h3>
        {meta && <span className="text-muted ml-auto text-xs">{meta}</span>}
      </div>
      <p className="text-muted line-clamp-3 text-sm">{sub}</p>
      <label className="mt-auto flex items-center gap-2 text-sm">
        <span className="text-muted">{t("voice")}</span>
        <select
          value={voice}
          onChange={(e) => {
            stop();
            onVoice(e.target.value);
          }}
          className="border-border-strong bg-surface h-8 min-w-0 flex-1 rounded-lg border px-2"
        >
          {options.map((v) => (
            <option key={v.name} value={v.name}>
              {v.role ? `${roleOf(v)} · ${v.name}` : v.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void listen()}
          disabled={busy}
          className="border-border hover:bg-surface-2 inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-medium"
          title={t("previewHint")}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : playing ? (
            <Square className="size-3.5 fill-current" />
          ) : (
            <Play className="size-3.5" />
          )}
          {playing ? t("previewStop") : t("preview")}
        </button>
      </label>
    </article>
  );
}

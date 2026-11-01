"use client";
/* eslint-disable @next/next/no-img-element */
import {
  ArrowLeft,
  Headphones,
  Loader2,
  Mic2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Square,
  Timer,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  analyzeAudiobookAction,
  setAudioModeAction,
  setVoiceAction,
} from "@/app/actions/audiobook";
import { Cover } from "@/components/library/cover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AudiobookView } from "@/server/audiobook";
import { errorToast } from "@/lib/error-toast";
import { useAudiobook } from "./engine";

type Res = { id: string; title: string; type: string; cover: string | null; authors: string };
type Voice = { name: string; female: boolean; d: string; role?: string };

/** One voice sample plays at a time, page-wide; a second press stops it. */
const sample = { audio: null as HTMLAudioElement | null, id: "", urls: new Map<string, string>() };
const SAMPLE_EVENT = "nn:voice-sample";

const AUDIO_VERSION = "p4";
const SLEEP = [15, 30, 45, 60] as const;

/** The choice that matters before anything is made: one reader, or the whole cast. */
function ModeChoice({ cast, onChange }: { cast: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslations("audiobook");
  return (
    <div role="radiogroup" aria-label={t("mode")} className="grid gap-2 sm:grid-cols-2">
      {(
        [
          [false, Mic2, t("modeSolo"), t("modeSoloHint")],
          [true, Users, t("modeCast"), t("modeCastHint")],
        ] as const
      ).map(([v, Icon, name, hint]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={cast === v}
          onClick={() => onChange(v)}
          className={cn(
            "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition",
            cast === v
              ? "border-primary bg-primary-soft/60 ring-primary/30 ring-2"
              : "border-border hover:border-border-strong",
          )}
        >
          <Icon className="text-primary mt-0.5 size-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{name}</span>
            <span className="text-muted block text-xs">{hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
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
  const [cast, setCast] = useState(false);
  const errText = (code: string | null) =>
    code && te.has(code as "INTERNAL") ? te(code as "INTERNAL") : t("failed");
  const analyzing = busy || view?.status === "analyzing";

  // The preparation also starts by itself after a PDF upload: wait for it.
  useEffect(() => {
    if (view?.status !== "analyzing" || busy) return;
    const timer = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(timer);
  }, [view?.status, busy, router]);

  const prepare = async () => {
    setBusy(true);
    const r = await analyzeAudiobookAction(resource.id).catch(() => null);
    if (r?.ok && cast) await setAudioModeAction(resource.id, true).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return toast.error(errText(r && !r.ok ? r.code : null));
    router.refresh();
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
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
        <Ready resource={resource} view={view} voices={voices} />
      ) : (
        <section className="card flex flex-col gap-6 p-6 sm:flex-row sm:p-8">
          <Cover
            type={resource.type as "book"}
            title={resource.title}
            author={resource.authors}
            src={resource.cover}
            size="lg"
            className="w-36 shrink-0 self-center"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <h1 className="text-2xl font-bold tracking-tight">{resource.title}</h1>
            {view?.status === "failed" && (
              <p className="text-danger text-sm">{errText(view.error)}</p>
            )}
            {analyzing ? (
              <p className="text-muted flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> {t("preparing")}
              </p>
            ) : (
              <>
                <ModeChoice cast={cast} onChange={setCast} />
                <Button className="self-start" onClick={() => void prepare()}>
                  <Headphones /> {t("prepare")}
                </Button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** The player: the book and its sound, nothing else on the page. */
function Ready({
  resource,
  view,
  voices,
}: {
  resource: Res;
  view: AudiobookView;
  voices: Voice[];
}) {
  const t = useTranslations("audiobook");
  const te = useTranslations("errors");
  const router = useRouter();
  const [analysis, setAnalysis] = useState(view.analysis!);
  const cast = !!analysis.cast;
  const engine = useAudiobook()!;
  const { idx, playing, loading, time, speed, speeds, sleep } = engine;
  const { setSleep, setSpeed, go, toggle, seek, seekTo, open } = engine;
  const version = `${analysis.rev ?? "0"}.${analysis.voiceRev ?? 1}.${cast ? "c" : "s"}.${AUDIO_VERSION}`;
  // The book enters the site-wide player (one that is already playing goes on).
  useEffect(() => {
    open({
      id: resource.id,
      title: resource.title,
      authors: resource.authors,
      cover: resource.cover,
      version,
      cast,
      segments: view.segments,
      chapterAt: view.chapterAt,
      chapters: analysis.chapters.map((c) => c.title),
      startIdx: Math.min(view.position.idx, Math.max(0, view.segments - 1)),
      startSec: view.position.sec,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.id, version, open]);
  let chapter = "";
  view.chapterAt.forEach((at, k) => {
    if (at <= idx) chapter = analysis.chapters[k]?.title ?? chapter;
  });
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const nextSpeed = () => setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length]);

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
  const changeMode = async (v: boolean) => {
    setAnalysis((a) => ({ ...a, cast: v }));
    const r = await setAudioModeAction(resource.id, v);
    if (!r.ok) return errorToast(te, r);
    router.refresh();
  };

  return (
    <>
      <section className="ab-stage relative overflow-hidden rounded-3xl text-white">
        {resource.cover && <img src={resource.cover} alt="" aria-hidden className="ab-glow" />}
        <div className="relative grid items-center gap-8 p-6 sm:p-10 md:grid-cols-[15rem_1fr]">
          <Cover
            type="book"
            title={resource.title}
            author={resource.authors}
            src={resource.cover}
            className={cn(
              "mx-auto aspect-[2/3] h-auto w-44 transition-transform duration-700 md:w-full",
              playing && "scale-[1.03]",
            )}
          />
          <div className="flex min-w-0 flex-col gap-5">
            <div className="min-w-0 text-center md:text-left">
              <p className="truncate text-sm font-semibold text-[#f6c453]">{chapter || " "}</p>
              <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
                {resource.title}
              </h1>
              {resource.authors && (
                <p className="mt-1 truncate text-sm text-white/65">{resource.authors}</p>
              )}
            </div>
            <div>
              <input
                type="range"
                min={0}
                max={time.dur || 0}
                step={0.1}
                value={time.cur}
                disabled={!time.dur}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label={t("position")}
                className="ab-range w-full"
                style={{
                  ["--pct" as string]: `${time.dur ? (time.cur / time.dur) * 100 : 0}%`,
                }}
              />
              <div className="mt-1 flex justify-between text-xs text-white/60 tabular-nums">
                <span>{fmt(time.cur)}</span>
                <span>{t("part", { n: idx + 1, total: view.segments })}</span>
                <span>{time.dur ? fmt(time.dur) : "–:––"}</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1 sm:gap-2 md:justify-start">
              <button
                type="button"
                onClick={nextSpeed}
                aria-label={t("speed")}
                className="ab-btn w-12 text-sm font-semibold tabular-nums"
              >
                {speed}x
              </button>
              <button
                type="button"
                onClick={() => go(idx - 1)}
                aria-label={t("prev")}
                className="ab-btn"
              >
                <SkipBack className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => seek(-10)}
                aria-label={t("back15")}
                className="ab-btn"
              >
                <RotateCcw className="size-5" />
              </button>
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? t("pause") : t("play")}
                className="mx-1 grid size-16 shrink-0 place-items-center rounded-full bg-[#f6c453] text-[#1a1408] shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                {loading ? (
                  <Loader2 className="size-7 animate-spin" />
                ) : playing ? (
                  <Pause className="size-7" />
                ) : (
                  <Play className="size-7 translate-x-0.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => seek(10)}
                aria-label={t("fwd15")}
                className="ab-btn"
              >
                <RotateCw className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => go(idx + 1)}
                aria-label={t("next")}
                className="ab-btn"
              >
                <SkipForward className="size-5" />
              </button>
              <label
                className={cn("ab-btn relative", sleep != null && "text-[#f6c453]")}
                title={t("sleep")}
              >
                <Timer className="size-5" />
                <select
                  value={sleep == null ? "" : String(sleep === "chapter" ? "chapter" : "on")}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "on") return;
                    setSleep(
                      !v ? null : v === "chapter" ? "chapter" : Date.now() + Number(v) * 60_000,
                    );
                  }}
                  aria-label={t("sleep")}
                  className="absolute inset-0 cursor-pointer opacity-0"
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
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <ModeChoice cast={cast} onChange={(v) => void changeMode(v)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <CastCard
            resourceId={resource.id}
            speaker="narrator"
            name={t("narrator")}
            sub=""
            voice={analysis.narration.voice}
            voices={voices}
            onVoice={(v) => void changeVoice("narrator", v)}
            hue={null}
          />
          {cast &&
            analysis.characters.map((c) => (
              <CastCard
                key={c.name}
                resourceId={resource.id}
                speaker={c.name}
                name={c.name}
                sub=""
                voice={c.voice}
                voices={voices}
                onVoice={(v) => void changeVoice(c.name, v)}
                hue={null}
              />
            ))}
        </div>
      </section>
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

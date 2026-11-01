"use client";
import {
  ArrowLeft,
  AudioLines,
  Gauge,
  Headphones,
  Loader2,
  Mic2,
  MoonStar,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  TableOfContents,
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
import { ShareSwitch } from "@/components/social/share-switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AudiobookView } from "@/server/audiobook";
import { errorToast } from "@/lib/error-toast";
import { useAudiobook } from "./engine";
import { SeekIcon } from "./seek-icon";

type Res = { id: string; title: string; type: string; cover: string | null; authors: string };
type Voice = { name: string; female: boolean; d: string; role?: string };

/** One voice sample plays at a time, page-wide; a second press stops it. */
const sample = { audio: null as HTMLAudioElement | null, id: "", urls: new Map<string, string>() };
const SAMPLE_EVENT = "nn:voice-sample";

const AUDIO_VERSION = "p4";
const SLEEP = [15, 30, 45, 60] as const;

/** Bar heights: the same shape for a part every time, so the book looks like a sound. */
const barHeight = (i: number) => 30 + 70 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37 + 1));

/**
 * The whole book as one sound: a bar for each part, a gap between chapters.
 * Ready parts play when pressed; any other is ordered and made in the
 * background, so the listener never waits on a part they only wanted to line up.
 */
function BookWave({ chapterAt, chapters }: { chapterAt: number[]; chapters: string[] }) {
  const t = useTranslations("audiobook");
  const { src, idx, ready, queue, making, pick } = useAudiobook()!;
  const ordered = new Set(queue);
  const total = src?.segments ?? 0;
  const starts = new Set(chapterAt);
  const chapterOf = (i: number) => {
    let k = -1;
    chapterAt.forEach((at, n) => {
      if (at <= i) k = n;
    });
    return chapters[k] ?? "";
  };
  return (
    <div>
      <div className="ab-wave" role="group" aria-label={t("partsMap")}>
        {Array.from({ length: total }, (_, i) => {
          const state =
            i === making ? "making" : ready.has(i) ? "ready" : ordered.has(i) ? "ordered" : "empty";
          const label = `${t("part", { n: i + 1, total })} · ${t(`state.${state}` as "state.ready")}`;
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(i)}
              aria-label={label}
              aria-current={i === idx || undefined}
              title={[chapterOf(i), label].filter(Boolean).join("\n")}
              data-state={state}
              data-gap={(i > 0 && starts.has(i)) || undefined}
              className="ab-bar"
            >
              <span style={{ height: `${barHeight(i)}%` }} />
            </button>
          );
        })}
      </div>
      <p className="text-muted mt-1.5 text-xs">{t("partsHint")}</p>
    </div>
  );
}

/** Everything around the sound, one row: speed, sleep, chapter, the order. */
function PlayerChips({ chapterAt, chapters }: { chapterAt: number[]; chapters: string[] }) {
  const t = useTranslations("audiobook");
  const e = useAudiobook()!;
  const { src, speed, speeds, setSpeed, sleep, setSleep, ready, queue, making } = e;
  const [open, setOpen] = useState<"speed" | "sleep" | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (typeof sleep !== "number") return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick);
    const timer = setInterval(tick, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [sleep]);
  const total = src?.segments ?? 0;
  const left = typeof sleep === "number" ? Math.max(1, Math.ceil((sleep - now) / 60_000)) : 0;
  const sleepLabel =
    sleep === "chapter"
      ? t("sleepChapter")
      : typeof sleep === "number" && now
        ? t("sleepLeft", { n: left })
        : t("sleep");
  const chapterEnd = (k: number) => (chapterAt[k + 1] ?? total) - 1;
  const opt = (on: boolean) => cn("ab-opt", on && "ab-opt-on");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(open === "speed" ? null : "speed")}
          aria-expanded={open === "speed"}
          className="ab-chip"
        >
          <Gauge className="size-4" /> {speed}×
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === "sleep" ? null : "sleep")}
          aria-expanded={open === "sleep"}
          className={cn("ab-chip", sleep != null && "text-primary")}
        >
          <MoonStar className="size-4" /> {sleepLabel}
        </button>
        {chapters.length > 1 && (
          <label className="ab-chip relative min-w-0">
            <TableOfContents className="size-4 shrink-0" />
            <span className="truncate">{t("chapters")}</span>
            <select
              value=""
              aria-label={t("chapters")}
              onChange={(ev) => {
                const k = Number(ev.target.value);
                if (ready.has(chapterAt[k])) e.go(chapterAt[k], true);
                else e.orderParts(chapterAt[k], chapterEnd(k));
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              <option value="" disabled>
                {t("chapters")}
              </option>
              {chapters.map((c, k) => (
                <option key={k} value={k}>
                  {ready.has(chapterAt[k]) ? "✓ " : ""}
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-muted text-xs tabular-nums">
            {t("readyCount", { n: ready.size, total })}
          </span>
          {ready.size < total &&
            (queue.length > 0 && making != null ? (
              <button type="button" onClick={e.stopQueue} className="ab-chip">
                <Loader2 className="size-4 animate-spin" /> {t("queueStop", { n: queue.length })}
              </button>
            ) : (
              <button type="button" onClick={e.prepareAll} className="ab-chip ab-opt-on">
                <AudioLines className="size-4" />
                {queue.length ? t("queueResume", { n: queue.length }) : t("prepareAll")}
              </button>
            ))}
        </span>
      </div>
      {open === "speed" && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("speed")}>
          {speeds.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={speed === v}
              onClick={() => setSpeed(v)}
              className={opt(speed === v)}
            >
              {v}×
            </button>
          ))}
        </div>
      )}
      {open === "sleep" && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("sleep")}>
          <button
            type="button"
            role="radio"
            aria-checked={sleep == null}
            onClick={() => setSleep(null)}
            className={opt(sleep == null)}
          >
            {t("sleepOff")}
          </button>
          {SLEEP.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSleep(Date.now() + m * 60_000)}
              className="ab-opt"
            >
              {t("sleepMin", { n: m })}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={sleep === "chapter"}
            onClick={() => setSleep("chapter")}
            className={opt(sleep === "chapter")}
          >
            {t("sleepChapter")}
          </button>
        </div>
      )}
    </div>
  );
}

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
  const { idx, playing, loading, time } = engine;
  const { go, toggle, seek, seekTo, open } = engine;
  const version = `${analysis.rev ?? "0"}.${analysis.voiceRev ?? 1}.${cast ? "c2" : "s"}.${AUDIO_VERSION}`;
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
  const pct = time.dur ? (time.cur / time.dur) * 100 : 0;

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
      <section className="ab-deck flex flex-col gap-5 rounded-3xl p-5 sm:p-7">
        <div className="flex items-center gap-4 sm:gap-5">
          <Cover
            type="book"
            title={resource.title}
            author={resource.authors}
            src={resource.cover}
            className="aspect-[2/3] h-auto w-20 shrink-0 sm:w-24"
          />
          <div className="min-w-0">
            <p className="text-primary truncate text-sm font-semibold">{chapter || " "}</p>
            <h1 className="mt-0.5 text-xl leading-tight font-bold tracking-tight sm:text-2xl">
              {resource.title}
            </h1>
            {resource.authors && (
              <p className="text-muted mt-0.5 truncate text-sm">{resource.authors}</p>
            )}
          </div>
        </div>

        <BookWave chapterAt={view.chapterAt} chapters={analysis.chapters.map((c) => c.title)} />

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
            style={{ ["--pct" as string]: `${pct}%` }}
          />
          <div className="text-muted mt-1 flex justify-between text-xs tabular-nums">
            <span>{fmt(time.cur)}</span>
            <span>{t("part", { n: idx + 1, total: view.segments })}</span>
            <span>{time.dur ? fmt(time.dur) : "–:––"}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 sm:gap-3">
          <button
            type="button"
            onClick={() => go(idx - 1)}
            aria-label={t("prev")}
            className="ab-btn"
          >
            <SkipBack className="size-5 fill-current" />
          </button>
          <button
            type="button"
            onClick={() => seek(-10)}
            aria-label={t("back15")}
            title={t("back15")}
            className="ab-btn"
          >
            <SeekIcon dir={-1} className="size-7" />
          </button>
          <span className="ab-ring" style={{ ["--pct" as string]: `${pct}%` }}>
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? t("pause") : t("play")}
              className="btn-primary text-primary-foreground grid size-14 place-items-center rounded-full transition-transform active:scale-95"
            >
              {loading ? (
                <Loader2 className="size-6 animate-spin" />
              ) : playing ? (
                <Pause className="size-6" />
              ) : (
                <Play className="size-6 translate-x-0.5" />
              )}
            </button>
          </span>
          <button
            type="button"
            onClick={() => seek(10)}
            aria-label={t("fwd15")}
            title={t("fwd15")}
            className="ab-btn"
          >
            <SeekIcon dir={1} className="size-7" />
          </button>
          <button
            type="button"
            onClick={() => go(idx + 1)}
            aria-label={t("next")}
            className="ab-btn"
          >
            <SkipForward className="size-5 fill-current" />
          </button>
        </div>
        {loading && <p className="text-muted -mt-2 text-center text-xs">{t("voiceComing")}</p>}

        <PlayerChips chapterAt={view.chapterAt} chapters={analysis.chapters.map((c) => c.title)} />
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{t("title")}</span>
          <ShareSwitch resourceId={resource.id} what="audiobook" initial={view.isPublic} />
        </div>
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

"use client";
/* eslint-disable @next/next/no-img-element */
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
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { analyzeAudiobookAction, setVoiceAction } from "@/app/actions/audiobook";
import { Cover } from "@/components/library/cover";
import { PdfPage } from "@/components/reader/pdf-page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Analysis, AudiobookView } from "@/server/audiobook";
import { errorToast } from "@/lib/error-toast";
import { useAudiobook } from "./engine";

type Res = { id: string; title: string; type: string; cover: string | null; authors: string };
type Voice = { name: string; female: boolean; d: string; role?: string };

/** One voice sample plays at a time, page-wide; a second press stops it. */
const sample = { audio: null as HTMLAudioElement | null, id: "", urls: new Map<string, string>() };
const SAMPLE_EVENT = "nn:voice-sample";

const AUDIO_VERSION = "p4";
const SLEEP = [15, 30, 45, 60] as const;

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
  const engine = useAudiobook()!;
  const { idx, playing, loading, time, lines, marks, speed, speeds, sleep } = engine;
  const { setSleep, setSpeed, go, toggle, seek, seekTo, open } = engine;
  const version = `${analysis.rev ?? "0"}.${analysis.voiceRev ?? 1}.${AUDIO_VERSION}`;
  // The book enters the site-wide player (one that is already playing goes on).
  useEffect(() => {
    open({
      id: resource.id,
      title: resource.title,
      authors: resource.authors,
      cover: resource.cover,
      version,
      segments: view.segments,
      chapterAt: view.chapterAt,
      chapters: analysis.chapters.map((c) => c.title),
      startIdx: Math.min(view.position.idx, Math.max(0, view.segments - 1)),
      startSec: view.position.sec,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.id, version, open]);
  const chapterOf = (i: number) => {
    let c = -1;
    view.chapterAt.forEach((at, k) => {
      if (at <= i) c = k;
    });
    return c >= 0 ? analysis.chapters[c] : null;
  };

  // The line being read: exact from the server's marks, else estimated from the time.
  const chars = lines?.map((l) => l.text.length) ?? [];
  const totalChars = chars.reduce((a, b) => a + b, 0) || 1;
  let current = -1;
  if (lines && marks.length === lines.length) {
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
  const ch = chapterOf(idx);
  // The line being read stays in view (unless the reader scrolled away).
  const follow = useCallback((el: HTMLParagraphElement | null) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > window.innerHeight - 90)
      el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);
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
      <section className="card relative overflow-hidden">
        {resource.cover && (
          <img
            src={resource.cover}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-25 blur-3xl"
          />
        )}
        <div className="relative flex flex-col items-center gap-4 p-5 text-center sm:p-8">
          <Cover
            type={resource.type as "book"}
            title={resource.title}
            author={resource.authors}
            src={resource.cover}
            size="lg"
            className={cn("w-36 transition-transform duration-500", playing && "scale-[1.03]")}
          />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{resource.title}</h1>
            <p className="text-muted mt-0.5 truncate text-sm">
              {ch ? ch.title : resource.authors} · {t("part", { n: idx + 1, total: view.segments })}
            </p>
          </div>
          <div className="w-full max-w-xl">
            <input
              type="range"
              min={0}
              max={time.dur || 0}
              step={0.1}
              value={time.cur}
              disabled={!time.dur}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label={t("position")}
              className="w-full accent-[var(--primary)]"
            />
            <div className="text-muted flex justify-between text-xs tabular-nums">
              <span>{fmt(time.cur)}</span>
              <span>{time.dur ? fmt(time.dur) : "–:––"}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => go(idx - 1)} aria-label={t("prev")}>
              <SkipBack />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => seek(-10)} aria-label={t("back15")}>
              <RotateCcw />
            </Button>
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? t("pause") : t("play")}
              className="bg-primary text-primary-foreground mx-2 grid size-16 place-items-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              {loading ? (
                <Loader2 className="size-7 animate-spin" />
              ) : playing ? (
                <Pause className="size-7" />
              ) : (
                <Play className="size-7 translate-x-0.5" />
              )}
            </button>
            <Button variant="ghost" size="icon" onClick={() => seek(10)} aria-label={t("fwd15")}>
              <RotateCw />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => go(idx + 1)} aria-label={t("next")}>
              <SkipForward />
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              aria-label={t("speed")}
              className="border-border-strong bg-surface/70 h-9 rounded-lg border px-2 text-sm tabular-nums"
            >
              {speeds.map((v) => (
                <option key={v} value={v}>
                  {v}×
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
              className={cn(
                "border-border-strong bg-surface/70 h-9 rounded-lg border px-2 text-sm",
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
          {loading && (
            <p className="text-muted flex items-center gap-1.5 text-xs" aria-live="polite">
              <Loader2 className="size-3.5 animate-spin" /> {t("making")}
            </p>
          )}
          <p className="text-muted hidden text-[11px] sm:block">{t("keysHint")}</p>
        </div>
        <div className="bg-surface-2 relative h-1">
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
          {!lines ? (
            <p className="text-muted flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> {t("textLoading")}
            </p>
          ) : (
            <div className="flex flex-col gap-3 font-serif text-[17px] leading-relaxed">
              {lines.map((l, i) => (
                <p
                  key={i}
                  ref={i === current ? follow : undefined}
                  className={cn(
                    "rounded-lg px-2 py-1 transition-colors duration-300",
                    i === current && "bg-primary-soft",
                  )}
                >
                  {l.text}
                </p>
              ))}
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

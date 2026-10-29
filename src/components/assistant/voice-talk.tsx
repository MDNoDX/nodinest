"use client";
import { Mic, MicOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { VoiceOrb, type OrbState } from "./voice-orb";

type Turn = { heard: string; reply: string; conversationId: string | null; audio: string | null };

/** Loudness 0…1 of an analyser (RMS of the waveform). */
function rms(a: AnalyserNode | null, buf: Uint8Array<ArrayBuffer>) {
  if (!a) return 0;
  a.getByteTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    s += v * v;
  }
  return Math.min(1, Math.sqrt(s / buf.length) * 3.2);
}

const SPEECH_START = 0.09; // loudness that counts as speaking
const SILENCE_MS = 1300; // pause that ends the user's turn
const MAX_MS = 45_000;

/**
 * Live voice talk (like a phone call with Nodi): it listens, notices when you
 * stop speaking, answers aloud, then listens again. Tap the sphere to cut the
 * answer short; the mic button pauses listening.
 */
export function VoiceTalk({
  conversationId,
  onTurn,
  onClose,
}: {
  conversationId: string | null;
  onTurn: (t: { heard: string; reply: string; conversationId: string }) => void;
  onClose: () => void;
}) {
  const t = useTranslations("assistant");
  const te = useTranslations("errors");
  const [state, setState] = useState<OrbState>("idle");
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState<{ heard: string; reply: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<"female" | "male">(() => {
    try {
      return localStorage.getItem("nn:talk-voice") === "male" ? "male" : "female";
    } catch {
      return "female";
    }
  });

  const r = useRef({
    stream: null as MediaStream | null,
    ctx: null as AudioContext | null,
    mic: null as AnalyserNode | null,
    out: null as AnalyserNode | null,
    rec: null as MediaRecorder | null,
    audio: null as HTMLAudioElement | null,
    conv: conversationId,
    closed: false,
    buf: new Uint8Array(1024),
    state: "idle" as OrbState,
    muted: false,
    voice,
    /** The current `listen` (it restarts itself after each answer). */
    listen: null as null | (() => Promise<void>),
  });
  useEffect(() => {
    r.current.state = state;
    r.current.muted = muted;
    r.current.voice = voice;
  });

  const level = useCallback(() => {
    const s = r.current.state;
    return rms(
      s === "speaking" ? r.current.out : s === "listening" ? r.current.mic : null,
      r.current.buf,
    );
  }, []);

  /** Plays the answer (MP3 from the server, else the browser's own voice). */
  const say = useCallback(async (turn: Turn) => {
    const x = r.current;
    setState("speaking");
    if (turn.audio) {
      const bytes = Uint8Array.from(atob(turn.audio), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      const a = new Audio(url);
      x.audio = a;
      if (x.ctx) {
        const src = x.ctx.createMediaElementSource(a);
        const an = x.ctx.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        an.connect(x.ctx.destination);
        x.out = an;
      }
      await new Promise<void>((done) => {
        a.onended = () => done();
        a.onpause = () => done();
        a.onerror = () => done();
        void a.play().catch(() => done());
      });
      URL.revokeObjectURL(url);
      x.audio = null;
      x.out = null;
    } else if ("speechSynthesis" in window) {
      await new Promise<void>((done) => {
        const u = new SpeechSynthesisUtterance(turn.reply.replace(/[*#`_-]/g, " "));
        u.lang = document.documentElement.lang || "uz";
        u.onend = () => done();
        u.onerror = () => done();
        speechSynthesis.speak(u);
      });
    }
  }, []);

  const listen = useCallback(async () => {
    const x = r.current;
    if (x.closed || x.muted || !x.stream) return;
    setState("listening");
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    const rec = new MediaRecorder(x.stream, mime ? { mimeType: mime } : undefined);
    x.rec = rec;
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let spoke = false;
    let quietSince = 0;
    const started = performance.now();
    const watch = window.setInterval(() => {
      const lv = rms(x.mic, x.buf);
      const now = performance.now();
      if (lv > SPEECH_START) {
        spoke = true;
        quietSince = 0;
      } else if (spoke) {
        quietSince ||= now;
        if (now - quietSince > SILENCE_MS) rec.stop();
      }
      if (now - started > MAX_MS || x.closed || x.muted) rec.stop();
    }, 80);
    rec.onstop = async () => {
      window.clearInterval(watch);
      if (x.closed) return;
      if (x.muted) return setState("idle");
      if (!spoke) return void x.listen?.();
      setState("thinking");
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const b64 = await new Promise<string>((ok) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result).split(",")[1] ?? "");
        fr.readAsDataURL(blob);
      });
      const res = await fetch("/api/ai/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audio: b64,
          mime: blob.type || "audio/webm",
          conversationId: x.conv,
          voice: x.voice,
        }),
      }).catch(() => null);
      if (x.closed) return;
      if (!res?.ok) {
        const code = ((await res?.json().catch(() => ({}))) as { error?: string })?.error;
        setError(code && te.has(code) ? te(code) : t("voiceFailed"));
        setState("idle");
        return;
      }
      setError(null);
      const turn = (await res.json()) as Turn;
      if (!turn.heard) return void x.listen?.();
      if (turn.conversationId) {
        x.conv = turn.conversationId;
        onTurn({ heard: turn.heard, reply: turn.reply, conversationId: turn.conversationId });
      }
      setCaption({ heard: turn.heard, reply: turn.reply });
      await say(turn);
      if (!x.closed) void x.listen?.();
    };
    rec.start(250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say]);

  useEffect(() => {
    r.current.listen = listen;
  }, [listen]);

  // Start: the microphone, then listen.
  useEffect(() => {
    const x = r.current;
    x.closed = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (x.closed) return stream.getTracks().forEach((tr) => tr.stop());
        x.stream = stream;
        const ctx = new AudioContext();
        x.ctx = ctx;
        void ctx.resume();
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        x.mic = an;
        void listen();
      } catch {
        setError(t("micDenied"));
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      x.closed = true;
      if (x.rec?.state === "recording") x.rec.stop();
      x.audio?.pause();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      x.stream?.getTracks().forEach((tr) => tr.stop());
      void x.ctx?.close();
    };
  }, [listen, onClose, t]);

  const interrupt = () => {
    const x = r.current;
    if (x.state === "speaking") {
      x.audio?.pause();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    } else if (x.state === "idle" && !x.muted) void listen();
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    r.current.muted = m;
    if (m) {
      if (r.current.rec?.state === "recording") r.current.rec.stop();
    } else if (r.current.state === "idle") void listen();
  };

  const status =
    state === "listening"
      ? t("talkListening")
      : state === "thinking"
        ? t("talkThinking")
        : state === "speaking"
          ? t("talkSpeaking")
          : muted
            ? t("talkPaused")
            : t("talkTap");

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center bg-[#07070b] text-white"
      role="dialog"
      aria-modal="true"
      aria-label={t("voiceTalk")}
    >
      <div className="flex w-full items-center justify-between p-4">
        <div
          role="radiogroup"
          aria-label={t("talkVoice")}
          className="flex rounded-full bg-white/10 p-0.5 text-xs"
        >
          {(["female", "male"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={voice === v}
              onClick={() => {
                setVoice(v);
                try {
                  localStorage.setItem("nn:talk-voice", v);
                } catch {
                  /* ignore */
                }
              }}
              className={cn(
                "rounded-full px-3 py-1 font-medium",
                voice === v ? "bg-white text-black" : "text-white/70 hover:text-white",
              )}
            >
              {v === "female" ? t("voiceFemale") : t("voiceMale")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label={t("talkEnd")}
        >
          <X className="size-6" />
        </button>
      </div>

      <button
        type="button"
        onClick={interrupt}
        className="relative w-full max-w-[34rem] flex-1 outline-none"
        aria-label={status}
      >
        <VoiceOrb state={state} level={level} className="absolute inset-0 h-full w-full" />
      </button>

      <div className="flex w-full max-w-xl flex-col items-center gap-3 px-6 pb-8 text-center">
        <p className="text-sm font-medium text-white/80" aria-live="polite">
          {status}
        </p>
        {caption && (
          <div className="max-h-40 w-full overflow-y-auto text-sm leading-relaxed">
            <p className="text-white/50">{caption.heard}</p>
            <p className="mt-1 text-white/90">{caption.reply}</p>
          </div>
        )}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="mt-2 flex items-center gap-4">
          <button
            type="button"
            onClick={toggleMute}
            className={cn(
              "grid size-14 place-items-center rounded-full",
              muted ? "bg-white text-black" : "bg-white/12 text-white hover:bg-white/20",
            )}
            aria-label={muted ? t("talkResume") : t("talkPause")}
            aria-pressed={muted}
          >
            {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid size-14 place-items-center rounded-full bg-red-500 text-white hover:bg-red-600"
            aria-label={t("talkEnd")}
          >
            <X className="size-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

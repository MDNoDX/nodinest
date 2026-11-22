"use client";
import { Mic, MicOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { VisualCard, type Visual } from "./visual-card";
import { VoiceOrb, type OrbState } from "./voice-orb";

/** A card from the talk: confirmed by a button here, or by saying yes / no. */
export type TurnAction = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: "proposed" | "completed" | "failed" | "rejected";
  error?: string;
};

type Event =
  | { t: "heard"; heard: string }
  | { t: "conv"; conversationId: string }
  | { t: "text"; piece: string }
  | { t: "audio"; audio: string }
  | { t: "pcm"; audio: string; rate: number }
  | { t: "visual"; visual: Visual }
  | {
      t: "done";
      reply: string;
      conversationId: string | null;
      visuals: Visual[];
      actions?: TurnAction[];
    }
  | { t: "error"; code: string };

/** The browser's own recogniser, only for the words shown while you speak. */
type Live = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const LIVE_LANG: Record<string, string> = { ru: "ru-RU", en: "en-US" };

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
const SPEECH_MIN_MS = 160; // shorter sounds are clicks, not speech
const SILENCE_MS = 480; // pause that ends the user's turn
const MAX_MS = 45_000;
const BARGE_LEVEL = 0.12; // speaking over the answer stops it (normal speech, not a shout)…
const BARGE_MS = 300; // …after this long; clearly louder than the answer's own echo
const BARGE_GRACE_MS = 600; // the speakers start: the mic hears them first

/** The microphone at 16 kHz, 16-bit (what Gemini Live hears), as base64. */
function toPcm16(chunks: Float32Array[], rate: number) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(len);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  const ratio = rate / 16000;
  const out = new Int16Array(Math.floor(len / ratio));
  for (let i = 0; i < out.length; i++) {
    const at = i * ratio;
    const j = Math.floor(at);
    const v = all[j] + ((all[j + 1] ?? all[j]) - all[j]) * (at - j);
    out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  }
  let bin = "";
  const bytes = new Uint8Array(out.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

type LiveSession = {
  sendRealtimeInput: (p: { audio: { data: string; mimeType: string } }) => void;
  sendToolResponse: (p: {
    functionResponses: { id?: string; name?: string; response: Record<string, unknown> }[];
  }) => void;
  close: () => void;
};

/**
 * Live voice talk (like a phone call). First choice: Gemini Live — the
 * microphone streams to Google and the answer's voice streams back (first
 * sound in about half a second; Google hears when you stop, and speaking over
 * the answer stops it). If Live cannot start, the classic way: it listens,
 * notices when you stop speaking, sends the recording, says the answer
 * sentence by sentence, then listens again. The mic button pauses listening.
 */
export function VoiceTalk({
  conversationId,
  onTurn,
  onClose,
  cards: actionCards,
}: {
  conversationId: string | null;
  onTurn: (t: {
    heard: string;
    reply: string;
    conversationId: string;
    visuals: Visual[];
    actions: TurnAction[];
  }) => void;
  onClose: () => void;
  /** Cards waiting for the user, drawn by the chat (the same buttons as there). */
  cards?: React.ReactNode;
}) {
  const t = useTranslations("assistant");
  const te = useTranslations("errors");
  const [state, setState] = useState<OrbState>("idle");
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState<{ heard: string; reply: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Visual[]>([]);
  const [voice, setVoice] = useState<"female" | "male">(() => {
    try {
      return localStorage.getItem("nn:talk-voice") === "male" ? "male" : "female";
    } catch {
      return "female";
    }
  });

  // The parent re-renders on every turn; none of that may restart the audio.
  const cb = useRef({ onTurn, onClose, t, te });
  useEffect(() => {
    cb.current = { onTurn, onClose, t, te };
  });

  const r = useRef({
    stream: null as MediaStream | null,
    ctx: null as AudioContext | null,
    mic: null as AnalyserNode | null,
    out: null as AnalyserNode | null,
    rec: null as MediaRecorder | null,
    live: null as Live | null,
    /** Which answer is current: speaking over one moves this on. */
    turn: 0,
    abort: null as AbortController | null,
    sources: new Set<AudioBufferSourceNode>(),
    nextAt: 0,
    decoding: Promise.resolve(),
    barge: 0,
    /** Wakes the wait for the end of the answer. */
    wake: null as null | (() => void),
    conv: conversationId,
    closed: false,
    buf: new Uint8Array(1024),
    state: "idle" as OrbState,
    muted: false,
    voice,
    /** The current `listen` (it restarts itself after each answer). */
    listen: null as null | (() => Promise<void>),
    /** Gemini Live, when it is the engine (null = the classic way). */
    live2: null as LiveSession | null,
    tap: null as AudioWorkletNode | null,
    heard: "",
    reply: "",
    /** A new voice: the live session is being replaced, not lost. */
    switching: false,
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

  const stopAudio = useCallback(() => {
    const x = r.current;
    window.clearInterval(x.barge);
    x.sources.forEach((src) => {
      try {
        src.stop();
      } catch {
        /* already over */
      }
    });
    x.sources.clear();
    x.nextAt = 0;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    x.wake?.();
  }, []);

  /** Cuts the answer short and listens at once. */
  const hush = useCallback(() => {
    const x = r.current;
    x.turn++;
    x.abort?.abort();
    stopAudio();
    if (x.live2) return setState("listening");
    void x.listen?.();
  }, [stopAudio]);

  /** While the answer plays, a voice over it stops it. */
  const watchBarge = useCallback(() => {
    const x = r.current;
    window.clearInterval(x.barge);
    if (x.live2) return; // Gemini Live hears a voice over the answer itself
    let since = 0;
    const began = performance.now();
    x.barge = window.setInterval(() => {
      const now = performance.now();
      if (x.muted || now - began < BARGE_GRACE_MS) return;
      // Only a voice clearly louder than what the speakers are playing.
      // The echo reaches the mic much weaker than the speakers play it (echo cancellation).
      if (rms(x.mic, x.buf) < Math.max(BARGE_LEVEL, rms(x.out, x.buf) * 0.55)) since = 0;
      else if (!since) since = now;
      else if (now - since > BARGE_MS) hush();
    }, 40);
  }, [hush]);

  /** Queues one spoken piece right after the previous one. */
  const play = useCallback(
    (b64: string, turn: number) => {
      const x = r.current;
      x.decoding = x.decoding.then(async () => {
        const ctx = x.ctx;
        if (!ctx || turn !== x.turn || !x.out) return;
        if (ctx.state === "suspended") await ctx.resume().catch(() => {});
        const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        const buf = await ctx.decodeAudioData(bytes.buffer).catch(() => null);
        if (!buf || turn !== x.turn) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(x.out);
        const at = Math.max(ctx.currentTime + 0.03, x.nextAt);
        src.start(at);
        x.nextAt = at + buf.duration;
        x.sources.add(src);
        src.onended = () => x.sources.delete(src);
        if (x.sources.size === 1) {
          setState("speaking");
          watchBarge();
        }
      });
    },
    [watchBarge],
  );

  /** A piece of raw speech: joined to the previous one without a gap. */
  const playPcm = useCallback(
    (b64: string, rate: number, turn: number) => {
      const x = r.current;
      x.decoding = x.decoding.then(() => {
        const ctx = x.ctx;
        if (!ctx || turn !== x.turn || !x.out) return;
        const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        const samples = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
        const buf = ctx.createBuffer(1, samples.length, rate);
        buf.getChannelData(0).set(Float32Array.from(samples, (v) => v / 32768));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(x.out);
        const at = Math.max(ctx.currentTime + 0.03, x.nextAt);
        src.start(at);
        x.nextAt = at + buf.duration;
        x.sources.add(src);
        src.onended = () => x.sources.delete(src);
        if (x.sources.size === 1) {
          setState("speaking");
          watchBarge();
        }
      });
    },
    [watchBarge],
  );

  /** Sends the recording and follows the answer as it arrives. */
  const ask = useCallback(
    async (blob: Blob) => {
      const x = r.current;
      setState("thinking");
      const turn = ++x.turn;
      const ac = new AbortController();
      x.abort = ac;
      const b64 = await new Promise<string>((ok) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result).split(",")[1] ?? "");
        fr.readAsDataURL(blob);
      });
      const res = await fetch("/api/ai/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          audio: b64,
          mime: blob.type || "audio/webm",
          conversationId: x.conv,
          voice: x.voice,
        }),
      }).catch(() => null);
      if (x.closed || turn !== x.turn) return;
      const fail = (code?: string) => {
        const { t: tt, te: tte } = cb.current;
        setError(code && tte.has(code) ? tte(code) : tt("voiceFailed"));
        setState("idle");
      };
      if (!res?.ok || !res.body) {
        const code = ((await res?.json().catch(() => ({}))) as { error?: string })?.error;
        return fail(code);
      }
      setError(null);
      let heard = "";
      let reply = "";
      let spoken = false;
      const finish = (visuals: Visual[], actions: TurnAction[]) => {
        if (x.conv) cb.current.onTurn({ heard, reply, conversationId: x.conv, visuals, actions });
      };
      const handle = (e: Event) => {
        if (e.t === "heard") {
          heard = e.heard;
          setCaption({ heard, reply });
        } else if (e.t === "conv") x.conv = e.conversationId;
        else if (e.t === "visual") {
          // Shown while the answer is spoken, newest first.
          setCards((c) => (c.some((v) => v.title === e.visual.title) ? c : [e.visual, ...c]));
        } else if (e.t === "text") {
          reply += e.piece;
          setCaption({ heard, reply });
        } else if (e.t === "audio") {
          spoken = true;
          play(e.audio, turn);
        } else if (e.t === "pcm") {
          spoken = true;
          playPcm(e.audio, e.rate, turn);
        } else if (e.t === "done") {
          reply = e.reply;
          x.conv = e.conversationId ?? x.conv;
          setCaption({ heard, reply });
          setCards(e.visuals);
          finish(e.visuals, e.actions ?? []);
        } else if (e.t === "error") fail(e.code);
      };
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let tail = "";
      let failed = false;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          tail += value;
          const lines = tail.split("\n");
          tail = lines.pop() ?? "";
          for (const line of lines)
            if (line) {
              const e = JSON.parse(line) as Event;
              failed ||= e.t === "error";
              handle(e);
            }
        }
      } catch {
        if (turn === x.turn) fail();
        else if (heard) finish([], []); // spoken over: keep what was said
        return;
      }
      await x.decoding;
      if (x.closed || turn !== x.turn || failed) return;
      if (!heard) return void x.listen?.();
      if (spoken) {
        const left = (x.nextAt - (x.ctx?.currentTime ?? 0)) * 1000;
        await new Promise<void>((done) => {
          x.wake = done;
          window.setTimeout(done, Math.max(0, left) + 60);
        });
      } else if (reply && "speechSynthesis" in window) {
        setState("speaking");
        watchBarge();
        await new Promise<void>((done) => {
          x.wake = done;
          const u = new SpeechSynthesisUtterance(reply.replace(/[*#`_-]/g, " "));
          u.lang = document.documentElement.lang || "uz";
          u.onend = () => done();
          u.onerror = () => done();
          speechSynthesis.speak(u);
        });
      }
      window.clearInterval(x.barge);
      if (!x.closed && turn === x.turn) void x.listen?.();
    },
    [play, playPcm, watchBarge],
  );

  const listen = useCallback(async () => {
    const x = r.current;
    if (x.closed || x.muted || !x.stream) return;
    if (x.rec?.state === "recording") return;
    setState("listening");
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    const rec = new MediaRecorder(x.stream, mime ? { mimeType: mime } : undefined);
    x.rec = rec;
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // Words on screen while you speak (desktop Chrome; the phone's mic allows one user).
    const Rec = (window as unknown as { webkitSpeechRecognition?: new () => Live })
      .webkitSpeechRecognition;
    if (Rec && !("ontouchstart" in window)) {
      try {
        const live = new Rec();
        const lang = document.documentElement.lang;
        live.lang = LIVE_LANG[lang] ?? "uz-UZ";
        live.continuous = true;
        live.interimResults = true;
        live.onerror = () => {};
        live.onresult = (e) => {
          const heard = Array.from(e.results, (v) => v[0]?.transcript ?? "").join(" ");
          setCaption({ heard, reply: "" });
        };
        live.start();
        x.live = live;
      } catch {
        x.live = null;
      }
    }
    let loudMs = 0;
    let quietSince = 0;
    let floor = 1;
    const started = performance.now();
    const STEP = 40;
    const watch = window.setInterval(() => {
      const lv = rms(x.mic, x.buf);
      const now = performance.now();
      // The room's own noise is learned, so a fan does not keep the turn open.
      floor = Math.min(floor * 1.002 + 0.0002, Math.max(lv, 0.005));
      if (lv > Math.max(SPEECH_START, floor * 2.5)) {
        loudMs += STEP;
        quietSince = 0;
      } else if (loudMs >= SPEECH_MIN_MS) {
        quietSince ||= now;
        if (now - quietSince > SILENCE_MS) rec.stop();
      }
      if (now - started > MAX_MS || x.closed || x.muted) rec.stop();
    }, STEP);
    rec.onstop = () => {
      window.clearInterval(watch);
      try {
        x.live?.stop();
      } catch {
        /* already stopped */
      }
      x.live = null;
      if (x.closed) return;
      if (x.muted) return setState("idle");
      if (loudMs < SPEECH_MIN_MS) return void x.listen?.();
      void ask(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    };
    rec.start(100);
  }, [ask]);

  useEffect(() => {
    r.current.listen = listen;
  }, [listen]);

  /** Starts Gemini Live; false when it cannot (then the classic way runs). */
  const startLive = useCallback(async (): Promise<boolean> => {
    const x = r.current;
    if (!x.ctx || !x.stream || typeof AudioWorkletNode === "undefined") return false;
    const res = await fetch("/api/ai/live", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: x.conv, voice: x.voice }),
    }).catch(() => null);
    if (!res?.ok) {
      const code = ((await res?.json().catch(() => ({}))) as { error?: string })?.error;
      // A plan limit is the same for both ways: say it instead of trying the other.
      if (code === "PREMIUM_REQUIRED" || code === "RATE_LIMITED") {
        setError(cb.current.te.has(code) ? cb.current.te(code) : cb.current.t("voiceFailed"));
        setState("idle");
        return true;
      }
      return false;
    }
    const { token, model } = (await res.json()) as { token: string; model: string };
    if (x.closed) return true;
    let opened = false;
    try {
      const { GoogleGenAI, Modality } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
      const saveTurn = () => {
        const heard = x.heard.trim();
        const reply = x.reply.trim();
        x.heard = "";
        x.reply = "";
        if (!heard && !reply) return;
        void fetch("/api/ai/live/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId: x.conv, heard, reply }),
        })
          .then((rr) => (rr.ok ? rr.json() : null))
          .then((d: { conversationId?: string } | null) => {
            if (!d?.conversationId) return;
            x.conv = d.conversationId;
            cb.current.onTurn({ heard, reply, conversationId: d.conversationId, visuals: [], actions: [] });
          })
          .catch(() => {});
      };
      const session = (await ai.live.connect({
        model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onopen: () => {
            opened = true;
          },
          onmessage: (m: {
            serverContent?: {
              interrupted?: boolean;
              turnComplete?: boolean;
              modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
              inputTranscription?: { text?: string };
              outputTranscription?: { text?: string };
            };
            toolCall?: { functionCalls?: { id?: string; name?: string; args?: unknown }[] };
          }) => {
            const sc = m.serverContent;
            if (sc?.interrupted) {
              // Spoken over: the rest of this answer is dropped at once.
              x.turn++;
              stopAudio();
              setState("listening");
            }
            if (sc?.inputTranscription?.text) {
              if (x.reply) saveTurn(); // a new question after an answer
              x.heard += sc.inputTranscription.text;
              setCaption({ heard: x.heard, reply: "" });
              if (r.current.state !== "speaking") setState("listening");
            }
            for (const part of sc?.modelTurn?.parts ?? []) {
              const d = part.inlineData;
              if (!d?.data) continue;
              const rate = Number(/rate=(\d+)/.exec(d.mimeType ?? "")?.[1] ?? 24000);
              playPcm(d.data, rate, x.turn);
            }
            if (sc?.outputTranscription?.text) {
              x.reply += sc.outputTranscription.text;
              setCaption({ heard: x.heard, reply: x.reply });
            }
            if (sc?.turnComplete) {
              saveTurn();
              void x.decoding.then(() => {
                const left = (x.nextAt - (x.ctx?.currentTime ?? 0)) * 1000;
                window.setTimeout(() => {
                  if (!x.closed && x.live2 && r.current.state === "speaking" && x.sources.size === 0)
                    setState("listening");
                }, Math.max(0, left) + 80);
              });
            }
            for (const call of m.toolCall?.functionCalls ?? []) {
              // Answered at once, so the voice goes on; the card is drawn when it comes.
              x.live2?.sendToolResponse({
                functionResponses: [{ id: call.id, name: call.name, response: { shown: true } }],
              });
              if (call.name === "show_card")
                void fetch("/api/ai/live/card", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(call.args ?? {}),
                })
                  .then((rr) => (rr.ok ? rr.json() : null))
                  .then((d: { card?: Visual } | null) => {
                    const card = d?.card;
                    if (card)
                      setCards((c) => (c.some((v) => v.title === card.title) ? c : [card, ...c]));
                  })
                  .catch(() => {});
            }
          },
          onerror: () => {},
          onclose: () => {
            const was = x.live2;
            x.live2 = null;
            x.tap?.disconnect();
            x.tap = null;
            if (x.closed || !was) return;
            saveTurn();
            if (x.switching) return;
            // Closed by Google (time limit, network): the classic way carries on.
            stopAudio();
            void x.listen?.();
          },
        },
      })) as unknown as LiveSession;
      if (x.closed) {
        session.close();
        return true;
      }
      x.live2 = session;
      // The microphone, streamed in ~40 ms pieces.
      await x.ctx.audioWorklet.addModule("/live-mic.js");
      const tap = new AudioWorkletNode(x.ctx, "mic-tap");
      x.tap = tap;
      const src = x.ctx.createMediaStreamSource(x.stream);
      src.connect(tap);
      const rate = x.ctx.sampleRate;
      let pending: Float32Array[] = [];
      let have = 0;
      tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (!x.live2 || x.muted) return;
        pending.push(e.data);
        have += e.data.length;
        if (have < rate * 0.04) return;
        const data = toPcm16(pending, rate);
        pending = [];
        have = 0;
        try {
          x.live2.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } });
        } catch {
          /* closing */
        }
      };
      setError(null);
      setState("listening");
      return opened || !!x.live2;
    } catch {
      x.live2 = null;
      return false;
    }
  }, [playPcm, stopAudio]);

  // Start: the microphone, then Gemini Live (or the classic way).
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
        await ctx.resume().catch(() => {});
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        x.mic = an;
        const out = ctx.createAnalyser();
        out.fftSize = 1024;
        out.connect(ctx.destination);
        x.out = out;
        if (!(await startLive())) void listen();
      } catch {
        setError(cb.current.t("micDenied"));
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cb.current.onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      x.closed = true;
      try {
        x.live2?.close();
      } catch {
        /* already closed */
      }
      x.live2 = null;
      if (x.rec?.state === "recording") x.rec.stop();
      x.abort?.abort();
      stopAudio();
      x.stream?.getTracks().forEach((tr) => tr.stop());
      void x.ctx?.close();
    };
  }, [listen, startLive, stopAudio]);

  // Another voice in a live talk: a new session with it (the voice is part of the token).
  const firstVoice = useRef(voice);
  useEffect(() => {
    const x = r.current;
    if (voice === firstVoice.current) return;
    firstVoice.current = voice;
    if (!x.live2) return;
    x.switching = true;
    try {
      x.live2.close();
    } catch {
      /* already closed */
    }
    x.live2 = null;
    stopAudio();
    void startLive().then((ok) => {
      x.switching = false;
      if (!ok && !x.closed) void x.listen?.();
    });
  }, [voice, startLive, stopAudio]);

  const interrupt = () => {
    const x = r.current;
    if (x.live2) {
      if (x.state === "speaking") hush();
      return;
    }
    if (x.state === "speaking") hush();
    else if (x.state === "idle" && !x.muted) void listen();
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    r.current.muted = m;
    if (r.current.live2) return setState(m ? "idle" : "listening");
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

      {cards.length > 0 && (
        <div className="dark absolute top-16 right-4 z-10 hidden w-80 max-w-[40vw] flex-col gap-3 lg:flex">
          {cards.map((v, i) => (
            <VisualCard key={i} v={v} floating />
          ))}
        </div>
      )}
      <div className="flex w-full max-w-xl flex-col items-center gap-3 px-6 pb-8 text-center">
        {cards.length > 0 && (
          <div className="flex w-full flex-col gap-2 text-left lg:hidden">
            <VisualCard v={cards[0]} floating />
          </div>
        )}
        <p className="text-sm font-medium text-white/80" aria-live="polite">
          {status}
        </p>
        {actionCards && (
          <div className="animate-scale-in flex max-h-[45vh] w-full flex-col gap-2 overflow-y-auto text-left">
            {actionCards}
            <p className="text-xs text-white/60">{t("sayYesNo")}</p>
          </div>
        )}
        {!caption && cards.length === 0 && !actionCards && (
          // What one can ask for: a quiz, a timeline, a comparison.
          <div className="flex flex-col items-center gap-1.5 text-xs text-white/55">
            <span className="font-semibold tracking-wide text-white/40 uppercase">
              {t("talkTry")}
            </span>
            {(["talkIdea1", "talkIdea2", "talkIdea3"] as const).map((k) => (
              <span key={k} className="rounded-full border border-white/10 px-3 py-1">
                «{t(k)}»
              </span>
            ))}
          </div>
        )}
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

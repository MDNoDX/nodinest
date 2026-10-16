"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Gemini understands MP4/AAC best; Firefox falls back to Ogg/Opus, then WebM. */
const PREFERRED = ["audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];

export type Recording = { blob: Blob; seconds: number; mime: string; name: string };

/** Microphone recording with a live level meter. */
export function useRecorder(maxSeconds = 15 * 60) {
  const [state, setState] = useState<"idle" | "recording" | "denied">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const stopResolve = useRef<((r: Recording | null) => void) | null>(null);
  const cleanup = useRef<() => void>(() => {});

  const stop = useCallback(
    () =>
      new Promise<Recording | null>((resolve) => {
        if (!rec.current || rec.current.state === "inactive") return resolve(null);
        stopResolve.current = resolve;
        rec.current.stop();
      }),
    [],
  );

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mime = PREFERRED.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const r = new MediaRecorder(
        stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : undefined,
      );
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      // Level meter + timer.
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        const s = Math.floor((Date.now() - started.current) / 1000);
        setSeconds(s);
        if (s >= maxSeconds) void stop();
        raf = requestAnimationFrame(tick);
      };
      cleanup.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        setLevel(0);
      };
      r.onstop = () => {
        cleanup.current();
        const type = (r.mimeType || mime || "audio/webm").split(";")[0];
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunks.current, { type });
        const secs = Math.max(1, Math.round((Date.now() - started.current) / 1000));
        setState("idle");
        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
        stopResolve.current?.({
          blob,
          seconds: secs,
          mime: type,
          name: `Ovozli yozuv ${stamp}.${ext}`,
        });
        stopResolve.current = null;
      };
      rec.current = r;
      started.current = Date.now();
      setSeconds(0);
      r.start(1000);
      setState("recording");
      raf = requestAnimationFrame(tick);
    } catch {
      setState("denied");
    }
  }, [maxSeconds, stop]);

  const cancel = useCallback(() => {
    if (rec.current && rec.current.state !== "inactive") {
      rec.current.onstop = () => {
        cleanup.current();
        setState("idle");
      };
      rec.current.stop();
    }
  }, []);

  useEffect(() => () => cleanup.current(), []);
  return { state, seconds, level, start, stop, cancel };
}

export const fmtSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

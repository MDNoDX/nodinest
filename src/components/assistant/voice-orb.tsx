"use client";
import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

/**
 * A glowing sphere of particles (canvas 2D, no library). It turns slowly,
 * breathes while idle, swirls while thinking and ripples with the voice:
 * `level()` returns the current loudness 0…1 (mic while listening, the reply
 * while speaking).
 */
export function VoiceOrb({
  state,
  level,
  className,
}: {
  state: OrbState;
  level: () => number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, level });
  useEffect(() => {
    live.current = { state, level };
  });

  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Points evenly spread over a sphere (Fibonacci lattice).
    const N = 1500;
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, seed: Math.random() * Math.PI * 2 };
    });
    let raf = 0;
    let t = 0;
    let rot = 0;
    let amp = 0;
    let spin = 0.004;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = c.getBoundingClientRect();
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    const frame = () => {
      const { state: s, level: lv } = live.current;
      const target = s === "speaking" || s === "listening" ? Math.min(1, lv() * 1.6) : 0;
      amp += (target - amp) * 0.18;
      spin += ((s === "thinking" ? 0.022 : s === "speaking" ? 0.008 : 0.004) - spin) * 0.05;
      t += reduce ? 0.004 : 0.016;
      rot += reduce ? spin * 0.25 : spin;
      const W = c.width;
      const H = c.height;
      const R = Math.min(W, H) * 0.3;
      g.clearRect(0, 0, W, H);
      // Soft glow behind the sphere.
      const glow = g.createRadialGradient(W / 2, H / 2, R * 0.2, W / 2, H / 2, R * 1.9);
      glow.addColorStop(0, `rgba(255,140,40,${0.22 + amp * 0.25})`);
      glow.addColorStop(0.5, "rgba(255,90,20,0.06)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const tilt = 0.35;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      const breathe = 1 + Math.sin(t * 1.4) * 0.015;
      for (const p of pts) {
        // Ripples over the surface, stronger when the voice is loud.
        const wave = Math.sin(p.y * 6 + t * 3 + p.seed) * 0.5 + Math.sin(p.x * 5 - t * 2.3) * 0.5;
        const swirl = s === "thinking" ? Math.sin(p.seed + t * 4) * 0.04 : 0;
        const k = breathe + amp * 0.22 * wave + swirl;
        let x = p.x * cos - p.z * sin;
        let z = p.x * sin + p.z * cos;
        let y = p.y;
        const y2 = y * ct - z * st;
        z = y * st + z * ct;
        y = y2;
        x *= k;
        y *= k;
        z *= k;
        const depth = (z + 1.4) / 2.8; // 0 (back) … 1 (front)
        const persp = 1 / (1.9 - z * 0.45);
        const px = W / 2 + x * R * persp * 1.6;
        const py = H / 2 + y * R * persp * 1.6;
        const size = (0.6 + depth * 1.8) * (W / 600) * (1 + amp * 0.6);
        const hot = Math.max(0, Math.min(1, depth * 0.8 + amp * 0.4 + wave * 0.1));
        const r = 255;
        const gg = Math.round(90 + hot * 120);
        const b = Math.round(20 + hot * 60);
        g.fillStyle = `rgba(${r},${gg},${b},${0.12 + depth * 0.75})`;
        g.beginPath();
        g.arc(px, py, size, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvas} className={className} aria-hidden />;
}

"use client";
import { useEffect } from "react";

/**
 * The book under the mouse leans towards the pointer and its light follows it
 * (CSS variables --rx / --ry / --gx / --gy on that one .cover-book, read by
 * globals.css). One listener for the whole app, one frame at a time; only for
 * a real mouse (phones keep the plain hover) and never with reduced motion.
 */
export function BookTilt() {
  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let book: HTMLElement | null = null;
    let frame = 0;
    let x = 0;
    let y = 0;
    const reset = (b: HTMLElement) => {
      delete b.dataset.tilt;
      for (const v of ["--rx", "--ry", "--gx", "--gy"]) b.style.removeProperty(v);
    };
    const paint = () => {
      frame = 0;
      if (!book) return;
      const r = book.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (x - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (y - r.top) / r.height));
      book.dataset.tilt = "";
      book.style.setProperty("--ry", `${((px - 0.5) * 22).toFixed(2)}deg`);
      book.style.setProperty("--rx", `${((0.5 - py) * 14).toFixed(2)}deg`);
      book.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
      book.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
    };
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(".cover-book") as HTMLElement | null;
      if (el !== book) {
        if (book) reset(book);
        book = el;
      }
      if (!book) return;
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => {
      if (book) reset(book);
      book = null;
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

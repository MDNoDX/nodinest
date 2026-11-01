"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const GAP = 72;

/** Lays a copy of the flow out so that one page of it shows in `face`. */
function pageCopy(flow: HTMLElement, x: number, width: number) {
  const face = document.createElement("div");
  face.className = "book-face";
  const copy = flow.cloneNode(true) as HTMLElement;
  copy.style.width = `${width}px`;
  copy.style.transform = `translateX(${-x}px)`;
  copy.style.transition = "none";
  copy.querySelectorAll("[data-page]").forEach((el) => el.removeAttribute("data-page"));
  face.appendChild(copy);
  return face;
}

/**
 * Two facing pages: the text is poured into columns and one spread shows at a
 * time. A turn lays copies of the old and the new pages on a sheet that swings
 * over the spine, so the real text underneath stays selectable.
 */
export function useBookPages(
  on: boolean,
  more: () => Promise<boolean>,
  earlier: () => Promise<boolean>,
) {
  const frame = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLElement>(null);
  const [spread, setSpread] = useState(0);
  const [width, setWidth] = useState(0);
  const spreadRef = useRef(0);
  const turning = useRef(false);

  useEffect(() => {
    const el = frame.current;
    if (!on || !el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);

  const step = width + GAP;
  const go = useCallback((n: number) => {
    spreadRef.current = n;
    setSpread(n);
  }, []);

  const count = useCallback(
    () => (flow.current && step > GAP ? Math.ceil(flow.current.scrollWidth / step) : 1),
    [step],
  );

  /** The spread holding `el`. */
  const spreadOf = useCallback(
    (el: HTMLElement) => {
      const f = flow.current;
      if (!f || step <= GAP) return 0;
      return Math.max(
        0,
        Math.floor((el.getBoundingClientRect().left - f.getBoundingClientRect().left) / step),
      );
    },
    [step],
  );

  const turn = useCallback(
    async (dir: 1 | -1) => {
      const f = flow.current;
      const box = frame.current;
      if (!f || !box || turning.current) return;
      const from = spreadRef.current;
      turning.current = true;
      try {
        if (dir === 1 && from + 1 >= count() - 1) await more();
        if (dir === -1 && from === 0) {
          if (!(await earlier())) return;
        }
        const to = dir === 1 ? from + 1 : spreadRef.current - 1;
        if (to < 0 || to >= count()) return;
        const col = (width - GAP) / 2;
        const page = (s: number, right: boolean) => s * step + (right ? col + GAP : 0);
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return go(to);
        const start = spreadRef.current;
        const holder = document.createElement("div");
        holder.className = "book-turn";
        holder.setAttribute("aria-hidden", "true");
        // What stays put until the sheet lands on it.
        const still = pageCopy(f, page(start, dir === -1), width);
        still.classList.add(dir === 1 ? "book-left" : "book-right");
        const sheet = document.createElement("div");
        sheet.className = `book-sheet ${dir === 1 ? "book-right book-forward" : "book-left book-back"}`;
        const front = pageCopy(f, page(start, dir === 1), width);
        const back = pageCopy(f, page(to, dir === -1), width);
        back.classList.add("book-reverse");
        sheet.append(front, back);
        holder.append(still, sheet);
        box.appendChild(holder);
        go(to);
        await new Promise((done) => setTimeout(done, 620));
        holder.remove();
      } finally {
        turning.current = false;
      }
    },
    [count, earlier, go, more, step, width],
  );

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Element;
      if (t.closest?.("input,textarea,[contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        void turn(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        void turn(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, turn]);

  return { frame, flow, spread, step, width, gap: GAP, turn, go, spreadOf, ready: width > 0 };
}

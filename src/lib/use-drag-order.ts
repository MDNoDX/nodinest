"use client";
import { useRef, useState } from "react";

/**
 * Reordering a list in place (the side menu, the day's plan): hold an item (a moment on touch, or press and
 * move with the mouse) and drag it up or down; the new order is kept. `grid` lets tiles in rows
 * move in any direction (the nearest place wins).
 */
export function useDragOrder<T>(
  items: T[],
  keyOf: (t: T) => string,
  onReorder?: (keys: string[]) => void,
  { grid = false }: { grid?: boolean } = {},
) {
  const list = useRef<HTMLUListElement | HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const swallowClick = useRef(false);
  const start = (e: React.PointerEvent, from: number) => {
    // Buttons and fields inside an item keep working normally.
    if ((e.target as HTMLElement).closest("button, input, textarea, select, label")) return;
    if (!onReorder || (e.pointerType === "mouse" && e.button !== 0)) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const touch = e.pointerType !== "mouse";
    let active = false;
    let over = from;
    // The places are measured once, when the drag begins: measuring the list
    // while it reorders itself made items jump back and forth (the "shaking").
    let mids: { x: number; y: number }[] = [];
    const overAt = (x: number, y: number) => {
      if (grid) {
        let best = 0;
        mids.forEach((m, i) => {
          if (Math.hypot(m.x - x, m.y - y) < Math.hypot(mids[best].x - x, mids[best].y - y))
            best = i;
        });
        return best;
      }
      const i = mids.findIndex((m) => y < m.y);
      return i < 0 ? mids.length - 1 : i;
    };
    const begin = () => {
      active = true;
      const lis = [...(list.current?.children ?? [])] as HTMLElement[];
      mids = lis.map((li) => {
        const r = li.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      // No text selection, callout or page scroll while an item is held (Safari, Chrome).
      document.documentElement.classList.add("nn-dragging");
      setDrag({ from, over: from });
      navigator.vibrate?.(15);
    };
    // A drag starts only after holding still a moment (a passing touch or a
    // click never moves anything).
    const timer = window.setTimeout(begin, touch ? 420 : 320);
    const noScroll = (ev: TouchEvent) => active && ev.preventDefault();
    const move = (ev: PointerEvent) => {
      if (!active) {
        // Moving before the hold is over: a scroll or a click, not a drag.
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) end();
        return;
      }
      const o = overAt(ev.clientX, ev.clientY);
      if (o !== over) {
        over = o;
        setDrag({ from, over: o });
      }
    };
    const end = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchmove", noScroll);
      document.documentElement.classList.remove("nn-dragging");
      if (active) {
        swallowClick.current = true;
        setTimeout(() => (swallowClick.current = false), 50);
      }
      setDrag(null);
    };
    const up = () => {
      if (active && over !== from) {
        const next = items.map(keyOf);
        const [m] = next.splice(from, 1);
        next.splice(over, 0, m);
        onReorder(next);
      }
      end();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchmove", noScroll, { passive: false });
  };
  // While dragging, the list shows the order it would get.
  const shown = drag
    ? (() => {
        const v = [...items];
        const [m] = v.splice(drag.from, 1);
        v.splice(drag.over, 0, m);
        return v;
      })()
    : items;
  return { list, shown, drag, start, swallowClick, dragged: drag ? keyOf(items[drag.from]) : null };
}

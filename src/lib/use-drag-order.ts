"use client";
import { useRef, useState } from "react";

/**
 * Reordering a list in place (the side menu, the day's plan): hold an item (a moment on touch, or press and
 * move with the mouse) and drag it up or down; the new order is kept.
 */
export function useDragOrder<T>(
  items: T[],
  keyOf: (t: T) => string,
  onReorder?: (keys: string[]) => void,
) {
  const list = useRef<HTMLUListElement | HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const swallowClick = useRef(false);
  const start = (e: React.PointerEvent, from: number) => {
    // Buttons and fields inside an item keep working normally.
    if ((e.target as HTMLElement).closest("button, input, textarea, select, label")) return;
    if (!onReorder || (e.pointerType === "mouse" && e.button !== 0)) return;
    const y0 = e.clientY;
    const touch = e.pointerType !== "mouse";
    let active = false;
    let over = from;
    const overAt = (y: number) => {
      const lis = [...(list.current?.children ?? [])] as HTMLElement[];
      const i = lis.findIndex((li) => {
        const r = li.getBoundingClientRect();
        return y < r.top + r.height / 2;
      });
      return i < 0 ? lis.length - 1 : i;
    };
    const begin = () => {
      active = true;
      setDrag({ from, over: from });
      navigator.vibrate?.(15);
    };
    const timer = touch ? window.setTimeout(begin, 380) : 0;
    const noScroll = (ev: TouchEvent) => active && ev.preventDefault();
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.abs(ev.clientY - y0) > 8) {
          if (touch) return end(); // a scroll, not a drag
          begin();
        } else return;
      }
      const o = overAt(ev.clientY);
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

"use client";
import { useCallback, useEffect, useRef, type RefObject } from "react";

const NEAR = 120;
const goEnd = (s: HTMLElement | null | undefined) => {
  if (s) s.scrollTo({ top: s.scrollHeight });
  else window.scrollTo({ top: document.documentElement.scrollHeight });
};

/**
 * Keeps a chat at its newest line: it follows anything that makes `box` taller
 * (an answer, a card, a picture that loads) while the reader is at the bottom,
 * and stays put once they scroll up. The scrolling is the page's, or that of
 * `scroller` when the chat scrolls inside its own area. Returns "go to the end".
 */
export function useFollowBottom(
  box: RefObject<HTMLElement | null>,
  scroller?: RefObject<HTMLElement | null>,
) {
  const follow = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const s = scroller?.current;
    const onScroll = () => {
      follow.current = s
        ? s.scrollHeight - s.scrollTop - s.clientHeight < NEAR
        : document.documentElement.scrollHeight - window.scrollY - window.innerHeight < NEAR;
    };
    const grew = new ResizeObserver(() => {
      if (follow.current) goEnd(s);
    });
    grew.observe(el);
    if (s) grew.observe(s);
    const target: HTMLElement | Window = s ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      grew.disconnect();
      target.removeEventListener("scroll", onScroll);
    };
  }, [box, scroller]);
  return useCallback(() => {
    follow.current = true;
    goEnd(scroller ? scroller.current : null);
  }, [scroller]);
}

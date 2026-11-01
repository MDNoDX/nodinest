"use client";
import { useCallback, useEffect, useRef, type RefObject } from "react";

const NEAR = 120;
const pageEnd = () => window.scrollTo({ top: document.documentElement.scrollHeight });

/**
 * Keeps a page-long chat at its newest line: it follows anything that makes
 * `box` taller (an answer, a card, a picture that loads) while the reader is at
 * the bottom, and stays put once they scroll up. Returns "go to the end".
 */
export function useFollowBottom(box: RefObject<HTMLElement | null>) {
  const follow = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollHeight } = document.documentElement;
      follow.current = scrollHeight - window.scrollY - window.innerHeight < NEAR;
    };
    const grew = new ResizeObserver(() => {
      if (follow.current) pageEnd();
    });
    grew.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      grew.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [box]);
  return useCallback(() => {
    follow.current = true;
    pageEnd();
  }, []);
}
